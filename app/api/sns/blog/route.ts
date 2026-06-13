import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY 미설정" }, { status: 500 });

  const {
    hospitalName, department, topic, keywords,
    tone, platform, photoDescription, additionalInfo
  } = await req.json();

  const platformGuide: Record<string, string> = {
    naver: `네이버 블로그 최적화:
- 제목: 25자 내외, 핵심 키워드 포함
- 본문: 1500~2500자, 소제목(##) 3~5개
- 첫 문단에 병원명·위치·진료과 자연스럽게 포함
- 마지막에 예약·상담 CTA 문구
- 네이버 검색 상위노출을 위한 키워드 자연 배치`,
    tistory: `티스토리 블로그 최적화:
- 제목: 30자 내외
- 본문: 1200~2000자
- SEO 친화적 구조 (H2, H3 활용)
- 마지막 단락에 요약 + CTA`,
    kakao: `카카오 채널 포스팅:
- 짧고 임팩트 있게 (800자 내외)
- 이모지 적극 활용
- 친근하고 가벼운 톤`,
  };

  const systemPrompt = `당신은 병원 의료 마케팅 전문 블로그 작가입니다.
포토클리닉(병원 브랜딩 촬영 스튜디오)이 촬영한 병원 사진·영상을 활용해
병원이 SNS와 블로그에 올릴 수 있는 콘텐츠를 작성합니다.

중요 원칙:
- 의료광고법 준수: 치료 효과, 최고·최초·유일 표현 금지
- 자연스럽고 읽히는 글체
- 병원 사진/공간의 매력을 글로 표현
- ${platformGuide[platform] || platformGuide.naver}

반드시 JSON으로만 응답하세요:
{
  "title": "블로그 제목",
  "content": "본문 전체 (마크다운 형식)",
  "hashtags": ["태그1", "태그2"],
  "seoKeywords": ["키워드1", "키워드2"],
  "metaDescription": "검색 결과에 표시될 150자 내외 설명",
  "tips": ["추가 팁1", "추가 팁2"]
}`;

  const userPrompt = `병원 정보:
- 병원명: ${hospitalName}
- 진료과: ${department}
- 주제: ${topic}
- 핵심 키워드: ${keywords}
- 톤앤매너: ${tone}
- 플랫폼: ${platform}
- 사진 설명: ${photoDescription || "병원 내외부 전문 촬영 사진"}
- 추가 정보: ${additionalInfo || "없음"}

위 정보로 블로그 포스팅을 작성해주세요.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 3000,
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.error?.message }, { status: 500 });

  try {
    const result = JSON.parse(data.choices[0].message.content);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "파싱 실패" }, { status: 500 });
  }
}
