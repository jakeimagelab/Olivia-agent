import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });

  const { hospitalName, department, purpose, content, tone, additionalInfo } = await req.json();
  if (!hospitalName || !purpose) {
    return NextResponse.json({ ok: false, error: "병원명과 콘텐츠 목적은 필수입니다." }, { status: 400 });
  }

  const toneGuide: Record<string, string> = {
    "따뜻한": "따뜻하고 친근한 말투, 환자를 배려하는 느낌",
    "전문적인": "전문적이고 신뢰감 있는 말투, 의료 전문성 강조",
    "짧고 명확한": "핵심만 담은 간결한 문장, 군더더기 없이",
    "친근한": "편안하고 친근한 말투, 이웃집 느낌",
    "프리미엄한": "고급스럽고 차별화된 느낌, 세련된 표현",
  };

  const systemPrompt = `당신은 병원 네이버 플레이스 콘텐츠 전문가입니다.
의료광고법을 반드시 준수하며, 효과 보장·최고·최초·유일 표현은 절대 사용하지 않습니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "titles": ["제목 후보 1", "제목 후보 2", "제목 후보 3", "제목 후보 4", "제목 후보 5"],
  "body": "네이버 플레이스용 본문 (200자 내외)",
  "cta": "전화/예약 유도 문구",
  "image_suggestions": ["추천 이미지 유형 1", "추천 이미지 유형 2", "추천 이미지 유형 3"],
  "upload_checklist": ["업로드 체크리스트 항목 1", "항목 2", "항목 3"],
  "ad_risk": {
    "level": "안전",
    "warnings": []
  }
}`;

  const userPrompt = `병원명: ${hospitalName}
진료과: ${department || "미입력"}
콘텐츠 목적: ${purpose}
안내 내용: ${content || "없음"}
톤: ${tone || "따뜻한"} (${toneGuide[tone] || ""})
추가 정보: ${additionalInfo || "없음"}

위 정보로 네이버 플레이스 소식글 콘텐츠를 생성해주세요.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) return NextResponse.json({ ok: false, error: "AI 응답 없음" }, { status: 500 });

  try {
    const data = JSON.parse(raw);
    return NextResponse.json({ ok: true, ...data });
  } catch {
    return NextResponse.json({ ok: false, error: "응답 파싱 실패" }, { status: 500 });
  }
}
