import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface StyleProfile {
  name: string;
  tone: string;
  titlePatterns: string;
  openingPatterns: string;
  bodyStructure: string;
  commonPhrases: string[];
  ctaPatterns: string;
  photoclinicMessages: string[];
}

interface GenerateInput {
  styleProfile?: StyleProfile;
  hospitalName: string;
  department: string;
  blogType: string;
  topic: string;
  keywords: string;
  shootingDetails: string;
  hospitalFeatures: string;
  targetAudience: string;
  location: string;
  additionalInfo: string;
}

async function runRiskCheck(
  apiKey: string,
  text: string
): Promise<{
  level: string;
  issues: { original: string; risk_type: string; reason: string; suggestion: string; safe_alternative: string; level: string }[];
  summary: string;
}> {
  const systemPrompt = `당신은 한국 의료광고법 전문가입니다.
의료법 제56조 및 의료광고 심의 기준을 기반으로 텍스트를 검토합니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "overall_risk": "안전|주의|위험",
  "issues": [
    {
      "original": "위험 표현 원문",
      "risk_type": "효과보장|과장표현|비교우위|전후사진|후기체험담|가격이벤트|전문성과장|환자오인",
      "reason": "위험 사유 설명",
      "suggestion": "수정 제안 문구",
      "safe_alternative": "안전한 대체 문구",
      "level": "낮음|주의|위험"
    }
  ],
  "safe_summary": "전체 안전도 요약 1-2문장",
  "passed_checks": ["통과한 항목 1", "항목 2"]
}

검토 항목:
- 효과 보장 표현: "완전히 사라집니다", "100% 효과" 등
- 과장 표현: "최고", "최초", "유일", "완벽한" 등
- 비교 우위: 타 병원과의 직접 비교
- 전후사진 주의: 비교 전후 사진 설명
- 후기/체험담: "환자 후기에 따르면" 등
- 가격/이벤트 표현: 지나친 할인 강조
- 전문성 과장: 학위·경력 과장
- 환자 오인: 일반인이 의사로 오인할 표현`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `콘텐츠 유형: 블로그\n\n검토 대상 텍스트:\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    return { level: "주의", issues: [], summary: "위험도 검사를 완료하지 못했습니다." };
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) {
    return { level: "주의", issues: [], summary: "위험도 검사 응답 없음" };
  }

  try {
    const data = JSON.parse(raw);
    return {
      level: data.overall_risk ?? "주의",
      issues: data.issues ?? [],
      summary: data.safe_summary ?? "",
    };
  } catch {
    return { level: "주의", issues: [], summary: "위험도 파싱 실패" };
  }
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("pc_admin_session")?.value !== "active") {
    return NextResponse.json({ ok: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });
  }

  let input: GenerateInput;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "요청 본문 파싱 실패" }, { status: 400 });
  }

  const {
    styleProfile,
    hospitalName,
    department,
    blogType,
    topic,
    keywords,
    shootingDetails,
    hospitalFeatures,
    targetAudience,
    location,
    additionalInfo,
  } = input;

  if (!hospitalName?.trim() || !blogType?.trim() || !topic?.trim()) {
    return NextResponse.json(
      { ok: false, error: "병원명, 블로그 타입, 주제는 필수입니다." },
      { status: 400 }
    );
  }

  const systemPrompt = `당신은 포토클리닉(병원 브랜딩 촬영 전문 스튜디오) 전속 마케터이자 블로그 작가입니다.
포토클리닉이 촬영한 병원 사진을 활용해 병원이 SNS와 블로그에 올릴 수 있는 전문 콘텐츠를 작성합니다.

핵심 원칙:
- 의료광고법 준수: 최고·최초·유일·치료 효과 보장 등 표현 금지
- 포토클리닉의 촬영 전문성과 병원의 공간적 매력을 동시에 부각
- 스타일 프로필이 있으면 해당 톤·표현 방식을 최대한 반영
- 6가지 블로그 타입에 맞는 구조와 스타일 적용
- 반드시 JSON으로만 응답

블로그 타입별 구조 가이드:
1. 병원 촬영 사례형: 촬영 배경 → 공간 소개 → 촬영 하이라이트 → 완성된 브랜드 이미지 → CTA
2. 원장 프로필 촬영형: 원장 소개 → 촬영 컨셉 → 촬영 과정 에피소드 → 완성된 프로필 → 신뢰 메시지 → CTA
3. 하모니컷: 포토클리닉 하모니컷 서비스 소개 → 병원 공간 분석 → 촬영 결과 → 활용 방법 → CTA
4. 병원 이미지 진단형: 현재 병원 이미지 점검 → 문제 제기 → 포토클리닉 솔루션 → 개선 사례 → CTA
5. 촬영 후기형: 촬영 전 고민 → 포토클리닉 선택 이유 → 촬영 경험 → 결과 만족도 → CTA (의료광고법상 후기는 주의)
6. 병원 브랜딩 칼럼형: 병원 브랜딩 중요성 → 비주얼 브랜딩 전략 → 포토클리닉 접근법 → 사례 → CTA

반드시 아래 JSON 형식으로만 응답하세요:
{
  "titleCandidates": ["제목1", "제목2", "제목3"],
  "body": "본문 (마크다운 형식, 2000자 이상)",
  "headings": ["소제목1", "소제목2", "소제목3"],
  "metaDescription": "150자 내외 검색 엔진 설명",
  "hashtags": ["태그1", "태그2", "태그3"],
  "seoKeywords": ["키워드1", "키워드2", "키워드3"],
  "instagramSummary": "인스타그램용 캡션 (400자 이내, 해시태그 포함)",
  "naverPlaceVersion": "네이버 플레이스 소식글 버전 (500자 이내)",
  "cta": "CTA 문구 (1-2문장)",
  "tips": ["이 글을 더 잘 활용하기 위한 팁1", "팁2"]
}`;

  // Build style context section
  let styleContext = "";
  if (styleProfile) {
    styleContext = `
=== 스타일 프로필: ${styleProfile.name} ===
톤앤매너: ${styleProfile.tone}
제목 패턴: ${styleProfile.titlePatterns}
도입부 패턴: ${styleProfile.openingPatterns}
본문 구조: ${styleProfile.bodyStructure}
자주 쓰는 표현: ${(styleProfile.commonPhrases ?? []).join(", ")}
CTA 패턴: ${styleProfile.ctaPatterns}
포토클리닉 핵심 메시지: ${(styleProfile.photoclinicMessages ?? []).join(" / ")}

위 스타일 프로필의 톤과 표현 방식을 최대한 반영하여 작성하세요.
`;
  }

  const userPrompt = `${styleContext}
=== 블로그 생성 요청 ===

병원명: ${hospitalName}
진료과/분야: ${department || "미입력"}
블로그 타입: ${blogType}
주제/제목 방향: ${topic}
핵심 키워드: ${keywords || "미입력"}
촬영 내용: ${shootingDetails || "미입력"}
병원 특징/강점: ${hospitalFeatures || "미입력"}
타겟 독자: ${targetAudience || "미입력"}
지역: ${location || "미입력"}
추가 정보: ${additionalInfo || "미입력"}

위 정보를 바탕으로 ${blogType} 형식에 맞는 고품질 병원 마케팅 블로그 글을 작성해주세요.
- 본문은 마크다운 형식으로 소제목(##), 단락 구분을 명확하게 작성
- 독자가 실제로 도움받는 내용 + 포토클리닉의 전문 촬영 가치를 자연스럽게 녹여낼 것
- 의료광고법 위반 표현 절대 사용 금지
- SEO를 고려한 자연스러운 키워드 배치
- 한국어로 작성`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ ok: false, error: `OpenAI 오류: ${err}` }, { status: 500 });
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "AI 응답 없음" }, { status: 500 });
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "응답 파싱 실패" }, { status: 500 });
  }

  // Inline risk check on generated body
  const bodyText = (data.body as string) ?? "";
  const riskCheck = await runRiskCheck(apiKey, bodyText);

  return NextResponse.json({
    ok: true,
    titleCandidates: data.titleCandidates ?? [],
    body: bodyText,
    headings: data.headings ?? [],
    metaDescription: data.metaDescription ?? "",
    hashtags: data.hashtags ?? [],
    seoKeywords: data.seoKeywords ?? [],
    instagramSummary: data.instagramSummary ?? "",
    naverPlaceVersion: data.naverPlaceVersion ?? "",
    cta: data.cta ?? "",
    riskCheck: {
      level: riskCheck.level,
      issues: riskCheck.issues,
      summary: riskCheck.summary,
    },
    tips: data.tips ?? [],
  });
}
