import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { quick, hospitalName, specialties, doctors, viceDirectors, staff, patients, locations, purpose, notes } = body;

  /* ── 공통 시스템 프롬프트 ── */
  const systemPrompt = `당신은 병원 사진 촬영 전문 콘티 작가입니다.
병원 정보를 받아 실제 촬영 현장에서 사용할 수 있는 전문적인 콘티를 JSON으로 생성합니다.

[출력 형식 - 반드시 아래 JSON 구조만 반환]
{
  "conti": [
    {
      "category": "카테고리 (예: 하모니, 외래진료, 병동, 인테리어)",
      "duration": "예상 소요시간 (예: 15분)",
      "location": "촬영 장소",
      "cameraAngle": "카메라 구도 설명",
      "keyword": "핵심 키워드 (예: 따뜻한 병원 / 하모니)",
      "description": "촬영 상세 설명 및 연출 포인트 (줄바꿈 가능, 구체적으로 작성)",
      "personnel": "필요 인원 및 환자역할",
      "notes": "비고 (없으면 빈 문자열)"
    }
  ],
  "checklist": [
    {
      "number": 1,
      "category": "분류 (예: 가운 및 유니폼, 내부청소, 공유)",
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

[콘티 작성 기준]
- conti는 최소 12개 이상의 컷 생성
- 카테고리: 하모니(단체샷) → 진료공간별(진료과 특성에 맞는 공간) → 인테리어 순서
- checklist는 15개 내외 (가운/유니폼, 내부청소, 공유/섭외 분류)
- schedule은 당일 타임라인 (도착/셋팅 → 인테리어 → 메이크업 → 단체 → 개별진료 → 정리 순)
- 총 촬영시간은 5-7시간 기준으로 작성`;

  /* ── 빠른 생성 vs 상세 생성 분기 ── */
  let userPrompt: string;

  if (quick) {
    /* 진료과별 기본 설정 */
    const defaultsBySpecialty: Record<string, { staff: string; patients: string; locations: string; purpose: string }> = {
      "소아청소년과": {
        staff: "간호사 2명, 인포데스크 직원 1명",
        patients: "아이(소아, 만 4~7세) 1명 + 부모 1명",
        locations: "대기실(로비), 진료실, 예방접종실, 처치실",
        purpose: "홈페이지 및 SNS용. 따뜻하고 친근한 소아과 이미지, 아이와 부모가 안심할 수 있는 분위기"
      },
      "이비인후과": {
        staff: "간호사 2명, 인포데스크 직원 1명",
        patients: "성인 환자 1명 또는 아이+부모",
        locations: "대기실, 진료실(이비인후과 전용 장비), 처치실",
        purpose: "홈페이지 및 SNS용. 전문적이고 세심한 이비인후과 이미지"
      },
      "피부과": {
        staff: "피부관리사 1명, 간호사 1명, 상담실장 1명, 인포데스크 직원 1명",
        patients: "성인 여성 1명",
        locations: "상담실, 레이저/시술실, 회복실, 대기실(로비)",
        purpose: "홈페이지 및 SNS용. 세련되고 전문적인 피부과 이미지, 깔끔하고 고급스러운 분위기"
      },
      "성형외과": {
        staff: "상담실장 1명, 간호사 1명, 코디네이터 1명",
        patients: "성인 여성 1명",
        locations: "상담실, 시술실, 회복실, 대기실(로비)",
        purpose: "홈페이지 및 SNS용. 신뢰감 있고 세련된 성형외과 이미지"
      },
      "정형외과": {
        staff: "간호사 2명, 물리치료사 1명, 인포데스크 직원 1명",
        patients: "성인 남성 또는 여성 1명",
        locations: "대기실, 진료실, X-ray실, 물리치료실",
        purpose: "홈페이지 및 SNS용. 전문적이고 신뢰감 있는 정형외과 이미지"
      },
      "치과": {
        staff: "치과위생사 2명, 인포데스크 직원 1명",
        patients: "성인 환자 1명",
        locations: "대기실, 진료실(유닛체어), 상담실, 파노라마실",
        purpose: "홈페이지 및 SNS용. 깨끗하고 전문적인 치과 이미지, 편안한 분위기"
      },
      "내과": {
        staff: "간호사 2명, 인포데스크 직원 1명",
        patients: "성인 환자 1명",
        locations: "대기실, 진료실, 초음파실, 채혈실",
        purpose: "홈페이지 및 SNS용. 신뢰감 있고 전문적인 내과 이미지"
      },
      "산부인과": {
        staff: "간호사 2명, 상담실장 1명, 인포데스크 직원 1명",
        patients: "성인 여성 1명 (임산부 또는 일반 환자)",
        locations: "대기실, 진료실, 초음파실, 분만실(외관)",
        purpose: "홈페이지 및 SNS용. 따뜻하고 안심감 있는 산부인과 이미지"
      }
    };

    const specList = specialties.split(",").map((s: string) => s.trim());
    const firstSpec = specList[0];
    const defaults = defaultsBySpecialty[firstSpec] ?? {
      staff: "간호사 2명, 인포데스크 직원 1명",
      patients: "성인 환자 1명",
      locations: "대기실, 진료실, 처치실",
      purpose: "홈페이지 및 SNS용. 전문적이고 따뜻한 병원 이미지"
    };

    userPrompt = `[빠른 콘티 생성 모드]

진료과: ${specialties}

아래 기본 설정을 바탕으로 ${specialties} 병원의 표준 촬영 콘티를 생성해주세요.

기본 설정:
- 원장님: 1명
- 직원 구성: ${defaults.staff}
- 환자 모델: ${defaults.patients}
- 촬영 공간: ${defaults.locations}
- 촬영 목적: ${defaults.purpose}

${specialties}의 특성에 맞는 대표적인 진료/시술 장면을 반드시 포함하고,
해당 진료과에서 자주 사용하는 의료기기와 공간을 적극 활용해주세요.
생성 후 사용자가 수정할 수 있으므로, 일반적이면서도 실용적인 콘티로 작성해주세요.`;
  } else {
    userPrompt = `다음 병원 정보로 촬영 콘티를 생성해주세요.

병원명: ${hospitalName}
진료과: ${specialties}
원장님: ${doctors}명
부원장님: ${viceDirectors}명
직원 구성: ${staff || "미입력"}
환자 모델: ${patients || "미입력"}
촬영 공간/장소: ${locations || "미입력"}
촬영 목적/키워드: ${purpose}
특별 요청사항: ${notes || "없음"}`;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    })
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.error?.message || "OpenAI API 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  try {
    const result = JSON.parse(data.choices[0].message.content);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "AI 응답을 파싱하는 데 실패했습니다." },
      { status: 500 }
    );
  }
}
