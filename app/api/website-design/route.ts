import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hospitalName, doctorName, specialties, phone, address, concept, pages, memo } = body;

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 500 });

    const systemPrompt = `당신은 병원 홈페이지 콘텐츠 전문 기획자입니다.
병원 정보를 받아서 홈페이지에 들어갈 텍스트 콘텐츠를 JSON으로 생성합니다.

반드시 다음 JSON 구조로 응답하세요 (코드블록 없이 순수 JSON만):
{
  "hero": {
    "headline": "메인 헤드라인 (짧고 강렬하게, 병원 강점 표현)",
    "subline": "서브 문구 (진료 철학이나 차별점)",
    "cta": "예약 버튼 텍스트"
  },
  "about": {
    "title": "병원 소개 섹션 제목",
    "body": "병원 소개 본문 2-3문장 (신뢰감 있게)"
  },
  "services": [
    { "name": "진료항목명", "desc": "간략 설명" }
  ],
  "doctors": [
    { "name": "원장명", "title": "직책/전문분야", "bio": "한 줄 소개" }
  ],
  "notice": {
    "title": "공지사항/이벤트 제목",
    "body": "내용 한 문장"
  },
  "location": {
    "address": "주소",
    "hours": "진료시간 요약",
    "parking": "주차 안내"
  },
  "footer": {
    "copy": "저작권 문구",
    "tagline": "병원 슬로건"
  },
  "colorTheme": "green 또는 blue 또는 dark (병원 분위기에 맞게 선택)",
  "keywords": ["SEO 키워드 3개"]
}`;

    const userMsg = `병원명: ${hospitalName}
원장명: ${doctorName || "미입력"}
진료과: ${specialties || "미입력"}
전화번호: ${phone || "미입력"}
주소: ${address || "미입력"}
콘셉트/분위기: ${concept || "깔끔하고 신뢰감 있는"}
구성 페이지: ${pages?.join(", ") || "메인, 소개, 진료항목, 오시는길"}
추가 요청: ${memo || "없음"}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "{}";

    let content;
    try {
      content = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      content = match ? JSON.parse(match[0]) : {};
    }

    return NextResponse.json({ content });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
