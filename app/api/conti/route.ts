import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다." },
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
     진료과별 기본 설정
  ══════════════════════════════════════════ */
  const SPEC_DEFAULTS: Record<string, {
    staff: string;
    patients: string;
    locations: string;
    purpose: string;
    keyShots: string;
  }> = {
    "소아청소년과": {
      staff: "간호사 2명, 인포데스크 직원 1명",
      patients: "아이(만 4~7세) 1명 + 부모 1명, 청소년(만 13~17세) 1명",
      locations: "외래 대기실(로비), 진료실, 예방접종실, 처치실",
      purpose: "홈페이지 및 SNS용. 따뜻하고 친근한 소아과 이미지, 아이와 부모가 안심할 수 있는 분위기",
      keyShots: "청진기로 아이 진찰, 눈높이 맞추는 원장님, 예방접종 장면, 처치실 처치, 아이와 보호자 안심시키는 모습, 대기실 장난감·소품 활용",
    },
    "이비인후과": {
      staff: "간호사 2명, 청각치료사 1명, 인포데스크 직원 1명",
      patients: "성인 환자 1명, 아이+부모 1조",
      locations: "외래 대기실, 진료실(이비인후과 전용 내시경 장비), 청각검사실(방음부스), 처치실",
      purpose: "홈페이지 및 SNS용. 전문적이고 세심한 이비인후과 이미지, 청각치료 전문성 강조",
      keyShots: "이비인후과 전용 내시경 장비 사용(귀·코·목 진찰), 청각검사 방음부스 장면, 청각치료사와 환자 재활 장면, 처치실 흡입 처치",
    },
    "검진내과": {
      staff: "간호사 2명, 상담실장 1명, 인포데스크 직원 2명",
      patients: "성인 환자 2명(40~60대 남녀)",
      locations: "검진 인포데스크, 상담실, 진료실, 초음파실, 내시경실, 채혈실, 골다공증 검사실",
      purpose: "홈페이지 및 SNS용. 신뢰감 있고 전문적인 건강검진 이미지, 꼼꼼한 건강관리",
      keyShots: "검진 인포 접수 장면, 검진 프로그램 상담 장면, 초음파 검사(모니터 보며), 위·대장 내시경(모니터 집중, 원장님 2~3명 협진), 채혈 장면, 골다공증 검사",
    },
    "정형외과": {
      staff: "간호사 1명, 방사선사 1명",
      patients: "성인 환자 1명(무릎·허리 통증 설정)",
      locations: "진료실, C-ARM실, 초음파/주사치료실, X-ray실",
      purpose: "홈페이지 및 SNS용. 전문적이고 신뢰감 있는 정형외과, 척추·관절 전문 이미지",
      keyShots: "C-ARM(씨암) 시술 장면(허리·무릎), 초음파 보며 주사치료(관절), X-ray 결과 설명, 관절 부위 촉진·진찰, 척추·관절 모형 설명",
    },
    "신경외과": {
      staff: "간호사 1명, 방사선사 1명",
      patients: "성인 환자 1명(허리·목 디스크 설정)",
      locations: "진료실, C-ARM실, MRI실, X-ray실",
      purpose: "홈페이지 및 SNS용. 전문적이고 집중적인 신경외과 이미지, 척추 신경 전문성 강조",
      keyShots: "C-ARM(씨암) 신경차단술 장면(허리·목), MRI 영상 판독 및 설명, 척추 모형으로 설명, 집중하는 원장님 프로필, X-ray 판독",
    },
    "마취통증의학과": {
      staff: "간호사 1명, 방사선사 1명",
      patients: "성인 환자 1명(만성 통증 설정)",
      locations: "진료실, C-ARM실, 시술실, 초음파실",
      purpose: "홈페이지 및 SNS용. 통증 전문가 이미지, 정밀하고 집중적인 시술, 환자 통증 해결 전문성",
      keyShots: "C-ARM 신경차단술 장면(집중하는 모습), 초음파 보며 주사치료(정밀 시술), 통증 부위 진찰·설명, 시술 전 환자 상담",
    },
    "재활의학과": {
      staff: "물리치료사 2명, 운동치료사 1명, 간호사 1명",
      patients: "성인 환자 2명(재활 중, 다양한 연령대)",
      locations: "진료실, 물리치료실, 도수치료실, 운동치료실",
      purpose: "홈페이지 및 SNS용. 따뜻하고 전문적인 재활 이미지, 환자와 치료사의 신뢰 관계",
      keyShots: "도수치료 장면(치료사 집중), 충격파 치료 장면, 운동치료 지도 장면, 물리치료 장면, 치료사와 환자 소통하는 모습",
    },
    "성형외과": {
      staff: "상담실장 1명, 간호사 1명, 코디네이터 1명",
      patients: "성인 여성 1명(20~30대)",
      locations: "외래 대기실(로비), 상담실, 시술실, 회복실",
      purpose: "홈페이지 및 SNS용. 신뢰감 있고 세련된 성형외과 이미지, 고급스럽고 안심되는 분위기",
      keyShots: "상담실 1:1 상담 장면(거울 앞), 시술 전 마킹 장면, 시술실 집중 장면, 회복실 케어 장면, 결과 설명 장면",
    },
    "피부과": {
      staff: "피부관리사 1명, 간호사 1명, 상담실장 1명, 인포데스크 직원 1명",
      patients: "성인 여성 1명(20~40대)",
      locations: "외래 대기실(로비), 상담실, 레이저/시술실, 회복실",
      purpose: "홈페이지 및 SNS용. 세련되고 전문적인 피부과 이미지, 깔끔하고 고급스러운 분위기",
      keyShots: "피부 상태 체크·루페 사용, 레이저 시술 장면(집중), 피부관리 장면, 상담실 피부 상담, 회복실 케어·팩",
    },
    "안과": {
      staff: "간호사 1명, 시력검사 담당 1명, 인포데스크 직원 1명",
      patients: "성인 환자 1명, 어린이 환자 1명",
      locations: "외래 대기실, 시력검사실, 진료실(세극등 장비), 수술실(라식·백내장 장비)",
      purpose: "홈페이지 및 SNS용. 정밀하고 신뢰감 있는 안과 이미지, 눈 전문 의료기관",
      keyShots: "세극등 현미경 검사 장면, 시력검사 장면, 안저 촬영, 라식·백내장 수술 장비 장면, 안압 측정, 어린이 시력 검사",
    },
    "치과": {
      staff: "치과위생사 2명, 인포데스크 직원 1명",
      patients: "성인 환자 1명",
      locations: "외래 대기실, 진료실(유닛체어), 상담실, 파노라마실",
      purpose: "홈페이지 및 SNS용. 깨끗하고 전문적인 치과 이미지, 편안한 분위기",
      keyShots: "유닛체어 치료 장면(집중), 파노라마 엑스레이, 임플란트·교정 모형 설명, 구강 위생 관리, 상담실 치료 계획 설명",
    },
    "산부인과": {
      staff: "간호사 2명, 상담실장 1명, 인포데스크 직원 1명",
      patients: "성인 여성 1명(임산부 또는 일반 환자)",
      locations: "외래 대기실, 진료실, 초음파실, 분만실(외관)",
      purpose: "홈페이지 및 SNS용. 따뜻하고 안심감 있는 산부인과 이미지, 여성과 아이를 위한 공간",
      keyShots: "초음파 검사(모니터 보며 설명), 임산부 진찰 장면, 분만실 외관·장비, 신생아 관련 소품 활용, 여성건강 상담 장면",
    },
    "비뇨기과": {
      staff: "간호사 1명, 인포데스크 직원 1명",
      patients: "성인 남성 1명(40~60대)",
      locations: "외래 대기실, 진료실, 검사실, 시술실",
      purpose: "홈페이지 및 SNS용. 신뢰감 있고 전문적인 비뇨기과 이미지, 편안한 상담 분위기",
      keyShots: "진료 상담(편안한 분위기), 비뇨기과 전용 검사 장비 활용, 시술실 전문 장면, 원장님 집중하는 프로필",
    },
    "외과": {
      staff: "간호사 2명, 수술실 직원 1명",
      patients: "성인 환자 1명",
      locations: "진료실, 수술실, 회복실, 처치실",
      purpose: "홈페이지 및 SNS용. 전문적이고 신뢰감 있는 외과 이미지, 안전한 수술",
      keyShots: "수술실 집중 장면(수술 가운+장갑), 복강경 수술 장비 활용, 처치실 상처 처치, 수술 전 환자 설명 장면, 회복실 케어",
    },
    "정신건강의학과": {
      staff: "상담사 1명, 인포데스크 직원 1명",
      patients: "성인 환자 1명(20~40대)",
      locations: "외래 대기실(안락한 분위기), 상담실(소파 배치), 진료실",
      purpose: "홈페이지 및 SNS용. 따뜻하고 안심되는 정신건강의학과 이미지, 편안하고 프라이버시가 보장되는 공간",
      keyShots: "소파형 상담실에서 편안한 1:1 상담, 원장님의 공감하는 표정·몸짓, 안락한 대기실 인테리어, 심리검사 장면, 따뜻한 공간 연출",
    },
    "한방병원": {
      staff: "한방간호사 1명, 인포데스크 직원 1명",
      patients: "성인 환자 1명(40~60대)",
      locations: "외래 대기실, 진료실, 침치료실, 한방처치실, 탕전실",
      purpose: "홈페이지 및 SNS용. 전통과 현대가 조화된 한방병원 이미지, 자연스럽고 따뜻한 분위기",
      keyShots: "침 치료 장면(집중), 한약 탕전실 장면(약재·전통 소품), 부항 처치 장면, 추나요법 장면, 한방 처방 상담, 약재 소품 활용",
    },
  };

  /* ══════════════════════════════════════════
     진료과명 정규화
  ══════════════════════════════════════════ */
  const normalizeSpec = (s: string): string => {
    if (s.includes("소아")) return "소아청소년과";
    if (s.includes("이비인후")) return "이비인후과";
    if (s.includes("검진") || (s.includes("내과") && !s.includes("신경"))) return "검진내과";
    if (s.includes("정형")) return "정형외과";
    if (s.includes("신경외")) return "신경외과";
    if (s.includes("마취") || s.includes("통증")) return "마취통증의학과";
    if (s.includes("재활")) return "재활의학과";
    if (s.includes("성형")) return "성형외과";
    if (s.includes("피부")) return "피부과";
    if (s.includes("안과")) return "안과";
    if (s.includes("치과")) return "치과";
    if (s.includes("산부")) return "산부인과";
    if (s.includes("비뇨")) return "비뇨기과";
    if (s.includes("외과") && !s.includes("신경") && !s.includes("성형")) return "외과";
    if (s.includes("정신") || s.includes("신경정신")) return "정신건강의학과";
    if (s.includes("한방") || s.includes("한의")) return "한방병원";
    return s;
  };

  /* ══════════════════════════════════════════
     프롬프트 조합
  ══════════════════════════════════════════ */
  const specList: string[] = specialties
    ? specialties.split(",").map((s: string) => s.trim()).filter(Boolean)
    : [];
  const isComprehensive = specList.length > 1;

  // 통증계 진료과 여부 (C-ARM / 초음파 주사 필수 포함)
  const PAIN_SPECS = ["정형외과", "신경외과", "마취통증의학과", "재활의학과"];
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
     Anthropic API 호출
  ══════════════════════════════════════════ */
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.error?.message || "Anthropic API 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  const raw = data.content?.[0]?.text || "{}";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "AI 응답을 파싱하는 데 실패했습니다." },
      { status: 500 }
    );
  }
}
