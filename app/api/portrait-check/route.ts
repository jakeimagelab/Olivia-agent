import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// "프로필" 자동 분류는 반드시 아래를 모두 만족해야 한다 (절대 기준):
// 1) 사람이 정확히 1명
// 2) 정면을 응시하거나, 팔짱/손깍지 등 의도된 정지 포즈
// 이전엔 픽셀 대칭성/중앙 정렬만 보는 휴리스틱이라 인원수·시선·포즈를 전혀 판단하지 못했다.
export async function POST(req: NextRequest) {
  const { thumbnail } = await req.json();
  if (!thumbnail) return NextResponse.json({ ok: false, error: "thumbnail required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const prompt = `이 사진이 병원 프로필(인물) 사진인지 판단하세요. 반드시 아래 기준을 그대로 적용하세요.

1. personCount: 사진에 보이는 사람 수를 정확히 세세요 (0, 1, 2, 3 이상 중 하나).
2. facingForward: 그 사람이 얼굴을 카메라 쪽으로 향하고 있으면 true (완전 정면이 아니어도 얼굴이 카메라를 보고 있으면 true). 옆모습·뒷모습·고개를 숙이고 있으면 false.
3. intentionalPose: 팔짱을 끼거나, 손을 맞잡거나(손깍지), 가슴 앞에 손을 모으는 등 명확히 의도되고 정지된 포즈를 취하고 있으면 true. 걷는 중이거나, 무언가 작업/진료/대화 중이거나, 자연스러운 동작 중이면 false.
4. isProfile: personCount가 정확히 1이고, (facingForward가 true 이거나 intentionalPose가 true)일 때만 true. 그 외에는 모두 false — 사람이 0명이거나 2명 이상이면 무조건 false.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "personCount": 1,
  "facingForward": true,
  "intentionalPose": false,
  "isProfile": true,
  "confidence": 0.9
}`;

  try {
    const imgData = thumbnail.replace(/^data:image\/jpeg;base64,/, "").replace(/^data:image\/png;base64,/, "");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
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

    // 모델이 isProfile 판단을 어겼을 경우를 대비해 서버에서 기준을 한 번 더 강제한다.
    const personCount = Number(result.personCount ?? 0);
    const facingForward = result.facingForward === true;
    const intentionalPose = result.intentionalPose === true;
    const isProfile = personCount === 1 && (facingForward || intentionalPose);

    return NextResponse.json({
      ok: true,
      personCount,
      facingForward,
      intentionalPose,
      isProfile,
      confidence: result.confidence ?? 0.5,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "분석 실패" }, { status: 500 });
  }
}
