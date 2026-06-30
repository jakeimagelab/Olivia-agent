import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { thumbnail, lightingSensitivity = "medium", lightingOnly = false } = await req.json();
  if (!thumbnail) return NextResponse.json({ ok: false, error: "thumbnail required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const sensitivityNote = {
    loose:  "조명이 극도로 어두운(거의 검정) 경우만 ETC로 분류하세요.",
    medium: "얼굴과 상체가 명확히 어두운 경우 ETC로 분류하세요.",
    strict: "얼굴 밝기가 조금이라도 부족하면 ETC로 분류하세요.",
  }[lightingSensitivity as string] ?? "";

  // lightingOnly=true: 조명 상태만 확인 (시간차+AI 모드에서 ETC 필터용)
  const prompt = lightingOnly
    ? `이 사진의 조명 상태만 판단하세요.
- "normal": 얼굴과 상체가 정상적으로 노출
- "etc_dark": 얼굴이 명확히 어두운 컷
- "etc_black": 전체가 거의 검정인 컷
- "etc_test": 테스트컷 또는 활용 가치 없는 컷
${sensitivityNote}
★ 배경이 어둡다는 이유만으로 ETC 처리하지 마세요.

반드시 아래 JSON만 응답하세요:
{"lightingStatus": "normal", "ok": true}`
    : `이 사진은 스튜디오 인물 프로필 촬영 이미지입니다. 아래 항목을 정밀하게 분석하세요.

1. 조명 상태 (lightingStatus):
   - "normal": 얼굴과 상체가 정상적으로 노출된 경우
   - "etc_dark": 얼굴이 명확히 어둡거나 조명 일부가 불발된 컷
   - "etc_black": 조명이 거의 안 터져 전체가 어두운 컷
   - "etc_test": 테스트컷 또는 활용 가치가 없는 컷
   ${sensitivityNote}
   ★ 배경이 어둡다는 이유만으로 ETC 처리하지 마세요. 얼굴/상체가 정상이면 normal입니다.

2. 성별 (gender): "male" | "female" | "unknown"
   외모에서 확인 가능한 경우만 판단. 불확실하면 "unknown".

3. 연령대 (ageBand): "20s" | "30s" | "40s" | "50s" | "60s+" | "unknown"
   피부 탄력, 주름, 흰머리 등을 종합해 판단. 불확실하면 "unknown".

4. 머리카락 색상 (hairColor): "black" | "brown" | "blonde" | "white_gray" | "other" | "unknown"
   "white_gray": 흰색 또는 회색. 머리카락이 안 보이면 "unknown".

5. 머리카락 길이 (hairLength): "short" | "medium" | "long" | "bald" | "unknown"
   short: 귀 위 수준 / medium: 귀~어깨 / long: 어깨 아래 / bald: 민머리

6. 안경 착용 여부 (hasGlasses): true | false
   안경 또는 선글라스 착용이면 true. 매우 중요한 식별자이므로 정확히 판단.

7. 수염·턱수염 (hasBeard): true | false
   눈에 띄는 수염, 구레나룻, 턱수염이 있으면 true. 남성에게만 적용.

8. 얼굴형 (faceShape): "oval" | "round" | "square" | "heart" | "unknown"
   oval: 계란형 / round: 둥근형 / square: 각진 턱 / heart: 이마 넓고 턱 좁음
   불확실하거나 측면 촬영이면 "unknown".

반드시 아래 JSON 형식으로만 응답하세요:
{
  "lightingStatus": "normal",
  "gender": "female",
  "ageBand": "30s",
  "hairColor": "black",
  "hairLength": "long",
  "hasGlasses": false,
  "hasBeard": false,
  "faceShape": "oval",
  "confidence": 0.85
}`;

  try {
    const imgData = thumbnail
      .replace(/^data:image\/jpeg;base64,/, "")
      .replace(/^data:image\/png;base64,/, "");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
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
