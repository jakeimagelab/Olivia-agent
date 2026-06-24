import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("pc_admin_session")?.value !== "active") {
    return NextResponse.json({ ok: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });
  }

  let body: { body?: string; title?: string; targetFormat?: string; hospitalName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "요청 본문 파싱 실패" }, { status: 400 });
  }

  const { body: postBody, title, targetFormat, hospitalName } = body;
  if (!postBody?.trim()) {
    return NextResponse.json({ ok: false, error: "변환할 본문을 입력해주세요." }, { status: 400 });
  }
  if (!targetFormat || !["instagram", "naver-place"].includes(targetFormat)) {
    return NextResponse.json(
      { ok: false, error: 'targetFormat은 "instagram" 또는 "naver-place"여야 합니다.' },
      { status: 400 }
    );
  }

  const isInstagram = targetFormat === "instagram";
  const formatLabel = isInstagram ? "인스타그램 캡션" : "네이버 플레이스 소식글";
  const charLimit = isInstagram ? 400 : 500;

  const systemPrompt = `당신은 병원 마케팅 SNS 콘텐츠 전문가입니다.
블로그 본문을 ${formatLabel}으로 변환합니다.

${
  isInstagram
    ? `인스타그램 캡션 작성 규칙:
- 400자 이내로 간결하게
- 첫 줄에 핵심 메시지를 임팩트 있게
- 이모지를 적절히 활용하여 시각적으로 보기 좋게
- 관련 해시태그를 10-15개 포함 (본문 아래에 별도 배치)
- 병원/클리닉 계정에 맞는 전문적이면서도 친근한 톤
- 의료광고법 준수 (효과 보장 표현 금지)`
    : `네이버 플레이스 소식글 작성 규칙:
- 500자 이내
- 병원 방문을 유도하는 정보 중심 작성
- 진료 정보, 공간 소개, 서비스 특징 강조
- 해시태그 5-8개 포함
- 신뢰감 있는 정보 전달 톤
- 의료광고법 준수`
}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "result": "변환된 텍스트 (해시태그 포함)",
  "hashtags": ["태그1", "태그2"],
  "charCount": 350
}`;

  const userPrompt = `병원명: ${hospitalName || "미입력"}
원본 제목: ${title || "미입력"}

블로그 본문:
${postBody}

위 블로그 본문을 ${formatLabel}(으)로 변환해주세요. ${charLimit}자를 초과하지 마세요.`;

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
      temperature: 0.5,
      max_tokens: 2000,
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

  try {
    const data = JSON.parse(raw);
    const resultText: string = data.result ?? "";
    return NextResponse.json({
      ok: true,
      result: resultText,
      hashtags: data.hashtags ?? [],
      charCount: data.charCount ?? resultText.length,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "응답 파싱 실패" }, { status: 500 });
  }
}
