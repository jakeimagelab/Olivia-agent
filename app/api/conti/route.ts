import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MAX_REFERENCE_DOCUMENTS, MAX_REFERENCE_SCENES } from "@/lib/conti-library/config";
import { embedTexts } from "@/lib/conti-library/embeddings";
import { buildLibraryQueryText, buildReferenceBlock, toReferenceSummary } from "@/lib/conti-library/promptBuilder";
import { capByDistinctDocument, matchContiCaseScenes } from "@/lib/conti-library/search";
import type { ContiCaseReference } from "@/lib/conti-library/types";
import { PAIN_SPECS, SPEC_DEFAULTS, normalizeSpec } from "@/lib/conti/specDefaults";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const {
    quick,
    hospitalName,
    specialties,
    doctors,
    viceDirectors,
    staff,
    patients,
    locations,
    purpose,
    notes,
  } = body;

  /* ══════════════════════════════════════════
     시스템 프롬프트
  ══════════════════════════════════════════ */
  const systemPrompt = `당신은 병원 사진 촬영 전문 콘티 작가입니다.
병원 정보를 받아 실제 촬영 현장에서 사용할 수 있는 전문적인 콘티를 JSON으로 생성합니다.

[출력 형식 - 반드시 아래 JSON 구조만 반환]
{
  "conti": [
    {
      "category": "카테고리명 (예: 공통(하모니), 진료실, C-ARM/시술, 인테리어 등)",
      "duration": "예상 소요시간 (예: 15분)",
      "location": "촬영 장소 (예: 1층 외래 로비, C-ARM실 등)",
      "cameraAngle": "카메라 구도 설명",
      "keyword": "핵심 키워드 (예: 하모니 / 따뜻한 병원)",
      "description": "촬영 상세 설명 및 연출 포인트 (구체적으로, 줄바꿈 가능)",
      "personnel": "필요 인원 및 환자역할",
      "notes": "비고 (없으면 빈 문자열)"
    }
  ],
  "checklist": [
    {
      "number": 1,
      "category": "가운 및 유니폼",
      "item": "체크리스트 항목",
      "notes": "비고 (없으면 빈 문자열)"
    }
  ],
  "schedule": [
    {
      "time": "시간 (예: 13:00 - 14:00)",
      "activity": "활동 내용",
      "type": "사진/영상/빈 문자열",
      "requirements": "필요 인원 및 장소",
      "notes": "비고 (없으면 빈 문자열)"
    }
  ]
}

[핵심 규칙 1 — 하모니컷: 진료과 무관, 항상 최우선 포함 (가장 중요)]
아래 3가지는 모든 콘티의 첫 섹션으로 반드시 포함합니다:

① 로비/외래 하모니컷 (15분)
   - 의료진·간호사·직원이 함께 웃는 모습
   - "병원의 느낌을 보여주는 가장 중요한 컷"
   - 카메라를 보거나 자연스럽게 대화하는 모습 모두 촬영
   - 병동이 있는 경우 병동 통로 회진 컷도 추가

② 인포데스크 접수컷 (10분)
   - 환자가 실제 접수하고, 직원이 안내하는 모습
   - 의료진도 함께 자연스럽게 연출 가능
   - 환자그룹 2팀이 접수하면서 안내받는 장면

③ 상담컷 (진료실) (15분)
   - 원장님이 환자에게 진료 상담하는 모습
   - 카메라 응시 + 비응시(자연스러운) 두 가지 촬영
   - 모형·엑스레이 결과 설명, 가족 동반 연출도 포함

[핵심 규칙 2 — 정형외과 / 신경외과 / 마취통증의학과 / 재활의학과 공통 핵심 장면]
이 4개 진료과가 포함될 경우 반드시 아래 장면을 포함합니다:
- C-ARM(씨암) 신경차단술: 허리·목 등 C-ARM 장비 앞에서 집중하는 모습 (방사선사 포함)
- 초음파 보며 주사치료: 초음파 모니터 보면서 주사치료 집중하는 모습 (간호사 옆에서)
- 통증 진찰: 환자 통증 부위 체크·촉진하는 모습
- X-ray/MRI 판독: 방사선사가 장비 작동, 원장님이 영상 설명하는 모습
- 재활/물리치료(재활의학과 포함 시): 도수치료, 충격파, 운동치료 장면

[핵심 규칙 3 — 여러 진료과 선택 시]
진료과가 2개 이상이면 종합병원 콘티로 작성합니다.
- 하모니컷 섹션을 가장 먼저 배치
- 이후 진료과별 섹션으로 구분하여 구성
- 전체 원장님 협진 장면 1~2컷 포함

[핵심 규칙 4 — 분량]
- conti: 단일 진료과 최소 12컷 이상 / 종합병원(2과 이상) 최소 18컷 이상
- checklist: 16개 내외 (아래 기본 항목 반드시 포함)
- schedule: 당일 타임라인 (도착/셋팅 → 인테리어/전경 → 공통하모니 → 개별진료 → 시술/처치 → 정리 순)

[기본 체크리스트 — 반드시 아래 항목 포함]
[가운 및 유니폼]
1. 원장님 가운 (소매 및 몸에 맞게 준비) / 가운컬러: 화이트
2. 원장님 스크럽복
3. 원장님 포멀한 개인복장 (수트 또는 평소복장)
4. 인포데스크 직원 유니폼
5. 진료팀 직원 유니폼
6. 수술팀 직원 유니폼 (수술/시술 장면 포함 시)
7. 가운 및 유니폼 청결 준비 (새 것은 다림질 권장)
[내부청소]
8. 병원내부 청소
9. 각종 박스·쿠팡 택배(박스 및 비닐) 정리 (사용 박스는 창고에 보관)
10. 병원 전체 의자·테이블 배치 정리
11. 의료기기 및 각종 장비 전원케이블·케이블 정리
12. 인포데스크 인쇄물 정리
13. 휴지통·소화기 정리 (시야에서 안 보이게)
14. 종이컵·종이컵 디스펜서 정리 (안 보이게)
[공유/섭외]
15. 촬영 내용 직원 공유 (얼굴 측면·뒷면 나올 수 있음)
16. 환자역할 섭외 (콘티 참고)
17. 촬영 필요 역할 섭외 (직원역할, 상담실장역할 등)`;

  /* ══════════════════════════════════════════
     프롬프트 조합
  ══════════════════════════════════════════ */
  const specList: string[] = specialties
    ? specialties.split(",").map((s: string) => s.trim()).filter(Boolean)
    : [];
  const isComprehensive = specList.length > 1;

  // 통증계 진료과 여부 (C-ARM / 초음파 주사 필수 포함)
  const hasPainSpec = specList.some(s => PAIN_SPECS.includes(normalizeSpec(s)));

  let userPrompt: string;

  if (quick) {
    /* ── ⚡ 빠른 생성 ── */
    const firstNorm = normalizeSpec(specList[0] || "");
    const def = SPEC_DEFAULTS[firstNorm] ?? {
      staff: "간호사 2명, 인포데스크 직원 1명",
      patients: "성인 환자 1명",
      locations: "외래 대기실, 진료실, 처치실",
      purpose: "홈페이지 및 SNS용. 전문적이고 따뜻한 병원 이미지",
      keyShots: "진료 장면, 처치 장면, 원장님 프로필",
    };

    if (isComprehensive) {
      /* 종합병원 빠른 생성 */
      const specDetails = specList.map((s: string) => {
        const norm = normalizeSpec(s);
        const d = SPEC_DEFAULTS[norm];
        return d
          ? `[${s}]\n  직원: ${d.staff}\n  핵심장면: ${d.keyShots}`
          : `[${s}]\n  해당 진료과 특성에 맞게 작성`;
      }).join("\n\n");

      userPrompt = `[종합병원 콘티 — 빠른 생성 모드]

진료과: ${specialties}

■ 반드시 최우선으로 포함 (공통 하모니 섹션):
1. 외래 로비 하모니컷: 전체 의료진이 함께 웃는 모습 (15분) — 가장 중요한 컷
2. 인포데스크 접수컷: 환자 접수 + 직원 안내 + 의료진 미소 연출 (10분)
3. 진료실 상담컷: 원장님과 환자 자연스러운 상담 (15분)
${hasPainSpec ? "4. 병동 회진컷: 원장님 2~3명 함께 병동 통로 회진 (15분)\n" : ""}
■ 진료과별 전문 컷 (각 진료과 섹션으로 나누어 구성):
${specDetails}

${hasPainSpec ? "■ 통증계 진료과 공통 필수 장면:\n- C-ARM(씨암) 신경차단술 (허리·목)\n- 초음파 보며 주사치료\n- X-ray/MRI 판독 장면\n" : ""}
■ 추가 포함:
- 전체 원장님 협진 장면 (2~3명 함께) 1~2컷
- conti 최소 18컷 이상 생성`;

    } else {
      /* 단일 진료과 빠른 생성 */
      userPrompt = `[단일 진료과 콘티 — 빠른 생성 모드]

진료과: ${specialties}

기본 설정:
- 직원 구성: ${def.staff}
- 환자 모델: ${def.patients}
- 촬영 공간: ${def.locations}
- 촬영 목적: ${def.purpose}
- 핵심 장면: ${def.keyShots}

■ 반드시 콘티 앞부분에 포함:
1. 외래 로비 하모니컷 (의료진 다함께 웃는 컷 — 가장 중요, 15분)
2. 인포데스크 접수컷 (환자 접수 + 직원 안내, 10분)
3. 진료실 상담컷 (원장님 + 환자, 자연스러운 모습, 15분)

■ 이후 ${specialties} 전문 장면 순서로 구성:
${def.keyShots}
${hasPainSpec ? "\n■ 통증계 필수: C-ARM 시술, 초음파 주사치료, X-ray 판독 반드시 포함" : ""}

생성 후 사용자가 수정 가능하므로 실용적이고 일반적인 콘티로 작성하세요.`;
    }

  } else {
    /* ── 상세 생성 ── */
    const specDetails = specList.map((s: string) => {
      const norm = normalizeSpec(s);
      const d = SPEC_DEFAULTS[norm];
      return d ? `  [${s}] 핵심장면: ${d.keyShots}` : `  [${s}]`;
    }).join("\n");

    userPrompt = `다음 병원 정보로 촬영 콘티를 생성해주세요.

병원명: ${hospitalName || "미입력"}
진료과: ${specialties}${isComprehensive ? " → 종합병원 콘티로 작성 (진료과별 섹션 구성)" : ""}
원장님: ${doctors || 1}명
부원장님: ${viceDirectors || 0}명
직원 구성: ${staff || "미입력"}
환자 모델: ${patients || "미입력"}
촬영 공간/장소: ${locations || "미입력"}
촬영 목적/키워드: ${purpose || "홈페이지 및 SNS용"}
특별 요청사항: ${notes || "없음"}

진료과별 핵심 촬영 장면 참고:
${specDetails}

■ 반드시 콘티 앞부분에 포함:
1. 외래 로비 하모니컷 (의료진 다함께 웃는 컷 — 가장 중요)
2. 인포데스크 접수컷 (환자 접수 + 직원 안내)
3. 진료실 상담컷 (원장님 + 환자 자연스러운 상담)
${hasPainSpec ? "4. C-ARM 시술, 초음파 주사치료 장면 반드시 포함" : ""}`;
  }

  /* ══════════════════════════════════════════
     콘티 사례 라이브러리 — 유사 사례 참고 (있으면 프롬프트에 추가)
     사례가 없거나 임베딩/검색이 실패해도 절대 생성 자체를 막지 않는다 —
     실패 시 userPrompt는 오늘과 100% 동일하게 유지된다.
  ══════════════════════════════════════════ */
  let references: ContiCaseReference[] = [];
  try {
    const queryText = buildLibraryQueryText({ specialties: specialties ?? "", purpose, notes });
    const queryEmbedding = (await embedTexts([queryText]))?.[0];
    if (queryEmbedding) {
      const departmentFilter = specList.map(normalizeSpec);
      const db = getSupabaseAdmin();
      const hits = await matchContiCaseScenes(db, queryEmbedding, departmentFilter, MAX_REFERENCE_SCENES);
      const capped = capByDistinctDocument(hits, MAX_REFERENCE_DOCUMENTS);
      if (capped.length > 0) {
        userPrompt += buildReferenceBlock(capped);
        references = capped.map(toReferenceSummary);
      }
    }
  } catch (error) {
    console.error("[conti-library] 참고 사례 조회 실패 (생성은 계속 진행):", error);
  }

  /* ══════════════════════════════════════════
     Anthropic API 호출
  ══════════════════════════════════════════ */
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.error?.message || "OpenAI API 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  const raw = data.choices?.[0]?.message?.content || "{}";

  try {
    const result = JSON.parse(raw);
    return NextResponse.json({ ...result, references });
  } catch {
    console.error("파싱 실패, raw:", raw.slice(0, 200));
    return NextResponse.json(
      { error: "AI 응답을 파싱하는 데 실패했습니다." },
      { status: 500 }
    );
  }
}
