import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const { thumbnail } = await req.json();
  if (!thumbnail) return NextResponse.json({ ok: false, error: "thumbnail required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const prompt = `인물 사진의 품질을 평가합니다. 아래 기준으로만 분석하세요.

1. eyesClosed (눈 감힘 여부):
   - 눈이 완전히 감겼거나 절반 이상 감겼으면 true
   - 마스크 착용 시 보이는 눈 기준으로 판단
   - 인물이 없거나 눈이 보이지 않으면 false

2. expressionScore (표정 점수 0.0~1.0):
   - 1.0 = 환한 미소, 자연스러운 웃음
   - 0.8 = 부드러운 미소
   - 0.6 = 집중/업무 몰입 표정 (진료·시술 중 자연스러운 모습)
   - 0.4 = 무표정, 약간 어색
   - 0.2 = 어색함, 찡그림
   - 0.0 = 눈 감힘, 표정 왜곡

3. expressionType:
   - "smile" : 미소 또는 웃음
   - "focused" : 집중·업무 몰입 표정
   - "neutral" : 자연스러운 무표정
   - "bad" : 어색함, 찡그림, 눈 감힘

반드시 아래 JSON만 응답 (다른 텍스트 없이):
{"eyesClosed":false,"expressionScore":0.8,"expressionType":"smile"}`;

  try {
    const imgData = thumbnail.replace(/^data:image\/[^;]+;base64,/, "");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgData } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error("JSON 파싱 실패");
    const result = JSON.parse(match[0]);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "분석 실패" }, { status: 500 });
  }
}
