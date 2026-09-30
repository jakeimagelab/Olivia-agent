import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, SCENE_MODEL } from "@/lib/ai/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ImageInput = { name: string; thumbnail: string };
type RequestBody = { images?: ImageInput[]; checks?: { eyesClosed?: boolean; faceUnreadableLighting?: boolean } };

const schema = {
  name: "tcut_image_assessment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "eyesClosed", "faceUnreadableLighting", "lightingReason"],
          properties: {
            name: { type: "string" },
            eyesClosed: { type: "boolean" },
            faceUnreadableLighting: { type: "boolean" },
            lightingReason: { type: ["string", "null"] },
          },
        },
      },
    },
  },
} as const;

function imageUrl(value: string): string {
  return value.startsWith("data:") ? value : `data:image/jpeg;base64,${value}`;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
  if (!images.length || images.some((image) => !image?.name || !image.thumbnail)) {
    return NextResponse.json({ ok: false, error: "이미지 1~8장이 필요합니다." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "자동 기능이 꺼져 있습니다. 직접 T컷 정리를 사용해주세요." }, { status: 503 });
  }

  const eyes = body.checks?.eyesClosed !== false;
  const lighting = body.checks?.faceUnreadableLighting !== false;
  const prompt = `각 사진을 파일명별로 평가하세요. T컷 후보는 다음 두 조건으로만 찾습니다.
1) eyesClosed: 사람이 있고 눈이 완전히 감겼거나 반 이상 감겼을 때만 true. 인물이 없거나 눈이 보이지 않는 경우 false.
2) faceUnreadableLighting: 노출 실패·조명 미발광 때문에 얼굴을 식별할 수 없는 수준일 때만 true. 단순히 어둡거나 분위기 있는 사진, 인물이 없는 인테리어 사진은 false.
현재 검사 설정: 눈 감음 ${eyes ? "사용" : "미사용"}, 조명 미발광 ${lighting ? "사용" : "미사용"}. 미사용 항목은 false로 반환하세요.
lightingReason은 true일 때만 짧은 한국어 이유를 쓰고, 아니면 null로 반환하세요.`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: SCENE_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...images.flatMap((image) => [
            { type: "text" as const, text: `파일명: ${image.name}` },
            { type: "image_url" as const, image_url: { url: imageUrl(image.thumbnail), detail: "low" as const } },
          ]),
        ],
      }],
      response_format: { type: "json_schema", json_schema: schema },
      max_tokens: 120 * images.length,
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { results?: unknown };
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "T컷 자동 분석에 실패했습니다." }, { status: 500 });
  }
}
