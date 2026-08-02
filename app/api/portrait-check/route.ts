import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// "프로필" 자동 분류 기준 (절대 기준):
// 1) 사람이 1명 이상 (단독이든 여러 명이든 무관 — 의료진 단체사진도 프로필로 인정)
// 2) 환자가 없음
// 3) 카메라를 의식한 포즈 (정면 응시, 또는 팔짱/손깍지 등 의도된 정지 포즈)
// 4) 시술/상담/의료행위 행동이 없음
// 예전엔 "정확히 1명 + 정면"만 봐서 의료진 2명 이상, 단체 프로필이 전부 걸러졌다.
export async function POST(req: NextRequest) {
  const { thumbnail } = await req.json();
  if (!thumbnail) return NextResponse.json({ ok: false, error: "thumbnail required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const prompt = `이 사진이 병원 프로필(인물) 사진인지 판단하세요. 반드시 아래 기준을 그대로 적용하세요.

1. personCount: 사진에 보이는 사람 수를 정확히 세세요 (0, 1, 2, 3 이상 중 하나).
2. hasPatient: 환자로 보이는 사람이 있으면 true (진료복이 아닌 일반 방문객/환자 자세인 사람). 의료진뿐이면 false.
3. facingForward: 주요 인물(들)이 얼굴을 카메라 쪽으로 향하고 있으면 true (완전 정면이 아니어도 얼굴이 카메라를 보고 있으면 true). 옆모습·뒷모습·고개를 숙이고 있으면 false.
4. intentionalPose: 팔짱을 끼거나, 손을 맞잡거나(손깍지), 가슴 앞에 손을 모으는 등 명확히 의도되고 정지된 포즈를 취하고 있으면 true. 걷는 중이거나, 무언가 작업/진료/대화 중이거나, 자연스러운 동작 중이면 false.
5. hasTreatmentAction: 주사기/핸드피스/장비 등으로 실제 시술·처치 중이면 true.
6. hasConsultationAction: 환자에게 설명 중이거나 차트/펜을 들고 상담 중이면 true.
7. isProfile: personCount가 1 이상이고, hasPatient가 false이고, (facingForward 또는 intentionalPose)가 true이고, hasTreatmentAction과 hasConsultationAction이 모두 false일 때만 true.
   사람이 여러 명이어도 전부 의료진이고 카메라를 보고 정지 포즈라면 true입니다 — 인원수만으로 제외하지 마세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "personCount": 2,
  "hasPatient": false,
  "facingForward": true,
  "intentionalPose": false,
  "hasTreatmentAction": false,
  "hasConsultationAction": false,
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
        max_tokens: 200,
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
    const hasPatient = result.hasPatient === true;
    const facingForward = result.facingForward === true;
    const intentionalPose = result.intentionalPose === true;
    const hasTreatmentAction = result.hasTreatmentAction === true;
    const hasConsultationAction = result.hasConsultationAction === true;
    const isProfile = personCount >= 1
      && !hasPatient
      && (facingForward || intentionalPose)
      && !hasTreatmentAction
      && !hasConsultationAction;

    return NextResponse.json({
      ok: true,
      personCount,
      hasPatient,
      facingForward,
      intentionalPose,
      hasTreatmentAction,
      hasConsultationAction,
      isProfile,
      confidence: result.confidence ?? 0.5,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "분석 실패" }, { status: 500 });
  }
}
