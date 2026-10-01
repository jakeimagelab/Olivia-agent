import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, SCENE_MODEL } from "@/lib/ai/openai";
import { isAdminSession } from "@/lib/passkey";
import { normalizeSelectionReportFileNames } from "@/lib/photo-operations/selectionReportFileNames";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type RequestImage = { name: string; imageDataUrl: string };

const MAX_IMAGES = 4;
const MAX_IMAGE_DATA_URL_LENGTH = 8_000_000;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i;

const schema = {
  name: "selection_report_file_names",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["fileNames"],
    properties: {
      fileNames: {
        type: "array",
        maxItems: 500,
        items: { type: "string" },
      },
    },
  },
} as const;

function requestImages(value: unknown): RequestImage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_IMAGES).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const image = item as Record<string, unknown>;
    const name = typeof image.name === "string" ? image.name.trim() : "";
    const imageDataUrl = typeof image.imageDataUrl === "string" ? image.imageDataUrl : "";
    if (!name || !imageDataUrl || imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH || !IMAGE_DATA_URL_PATTERN.test(imageDataUrl)) return [];
    return [{ name, imageDataUrl }];
  });
}

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });

  let body: { images?: unknown };
  try {
    body = await request.json() as { images?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const images = requestImages(body.images);
  if (!images.length) return NextResponse.json({ ok: false, error: "PNG, JPG 또는 WebP 리포트 이미지 1~4장이 필요합니다." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: false, error: "이미지 분석 설정이 필요합니다." }, { status: 503 });

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: SCENE_MODEL,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "이 이미지는 사진 셀렉 리포트입니다. 화면에 실제로 적힌 완전한 JPG/JPEG 파일명만 읽어 fileNames에 넣으세요. 예: R5K04439.JPG. 확장자가 없는 숫자, RAW 파일명, 폴더명, 추정한 파일명은 절대 넣지 마세요. 화면의 썸네일이나 문맥으로 파일명을 추측하지 말고, 보이는 텍스트만 반환하세요.",
          },
          ...images.flatMap((image) => [
            { type: "text" as const, text: `리포트 이미지: ${image.name}` },
            { type: "image_url" as const, image_url: { url: image.imageDataUrl, detail: "high" as const } },
          ]),
        ],
      }],
      response_format: { type: "json_schema", json_schema: schema },
      max_tokens: 1_200,
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { fileNames?: unknown };
    const fileNames = normalizeSelectionReportFileNames(parsed.fileNames);
    return NextResponse.json({ ok: true, fileNames, analyzedImageCount: images.length });
  } catch (error) {
    console.error("[photo-operations extract-selection-file-names]", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "이미지 속 파일명을 분석하지 못했습니다." }, { status: 500 });
  }
}
