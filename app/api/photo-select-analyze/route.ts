import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, SCENE_MODEL } from "@/lib/ai/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RequestImage = { name: string; thumbnail: string };

const schema = {
  name: "photo_select_candidates",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["candidates"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "score", "reason"],
          properties: {
            name: { type: "string" },
            score: { type: "integer", minimum: 0, maximum: 3 },
            reason: { type: "string" },
          },
        },
      },
    },
  },
} as const;

function dataUrl(value: string): string {
  return value.startsWith("data:") ? value : `data:image/jpeg;base64,${value}`;
}

export async function POST(request: NextRequest) {
  let body: { query?: unknown; images?: unknown };
  try {
    body = await request.json() as { query?: unknown; images?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const images = Array.isArray(body.images) ? body.images.slice(0, 8).filter((image): image is RequestImage => Boolean(image) && typeof image === "object" && typeof (image as RequestImage).name === "string" && typeof (image as RequestImage).thumbnail === "string") : [];
  if (!query || !images.length) return NextResponse.json({ ok: false, error: "검색 문장과 이미지 1~8장이 필요합니다." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: false, error: "자동 기능이 꺼져 있습니다. 직접 셀렉을 사용해주세요." }, { status: 503 });

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: SCENE_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: `사용자 요청: ${query}\n각 사진을 이 요청과의 관련성으로 0~3점 평가하세요. 3은 명확히 관련, 2는 유력, 1은 가능성 있음, 0은 관련 없음입니다. reason은 근거를 짧은 한국어로 씁니다. 파일명마다 반드시 한 결과를 반환하세요.` },
          ...images.flatMap((image) => [
            { type: "text" as const, text: `파일명: ${image.name}` },
            { type: "image_url" as const, image_url: { url: dataUrl(image.thumbnail), detail: "low" as const } },
          ]),
        ],
      }],
      response_format: { type: "json_schema", json_schema: schema },
      max_tokens: 90 * images.length,
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { candidates?: unknown };
    return NextResponse.json({ ok: true, candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "AI 사진 셀렉에 실패했습니다." }, { status: 500 });
  }
}
