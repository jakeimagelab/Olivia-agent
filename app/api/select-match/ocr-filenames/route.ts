import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, SCENE_MODEL } from "@/lib/ai/openai";
import { extractFilenameBasenamesFromOcr, formatFilenameBasenamesOneLine } from "@/lib/selectMatchFilenameOcr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BASE64_LENGTH = 12_000_000;

const openAiOcrSchema = {
  name: "select_match_file_names",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["fileNames"],
    properties: {
      fileNames: { type: "array", maxItems: 800, items: { type: "string" } },
    },
  },
} as const;

async function extractWithOpenAi(imageDataUrl: string): Promise<string[]> {
  const response = await getOpenAIClient().chat.completions.create({
    model: SCENE_MODEL,
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: "이 이미지는 사진 셀렉 리포트입니다. 화면에서 실제로 읽을 수 있는 완전한 파일명(확장자 포함)만 fileNames에 반환하세요. 예: R5K04439.JPG. 보이지 않는 파일명, 썸네일만 보고 추정한 파일명, 폴더명은 넣지 마세요.",
        },
        { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
      ],
    }],
    response_format: { type: "json_schema", json_schema: openAiOcrSchema },
    max_tokens: 1_200,
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { fileNames?: unknown };
  const lines = Array.isArray(parsed.fileNames)
    ? parsed.fileNames.filter((name): name is string => typeof name === "string").join("\n")
    : "";
  return extractFilenameBasenamesFromOcr(lines);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  const body = await req.json().catch(() => null);
  const imageBase64 = typeof body?.imageBase64 === "string"
    ? body.imageBase64.replace(/^data:image\/[^;]+;base64,/, "")
    : "";
  if (!imageBase64) {
    return NextResponse.json({ ok: false, error: "스크린샷 이미지를 선택해주세요." }, { status: 400 });
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ ok: false, error: "이미지가 너무 큽니다. 더 작은 스크린샷을 사용해주세요." }, { status: 413 });
  }

  try {
    let filenames: string[];
    if (apiKey) {
      const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
            imageContext: { languageHints: ["ko", "en"] },
          }],
        }),
      });
      if (!visionResponse.ok) {
        console.error("[select-match] Google Vision filename OCR failed:", visionResponse.status);
        return NextResponse.json({ ok: false, error: "스크린샷 문자 인식에 실패했습니다." }, { status: 502 });
      }
      const visionData = await visionResponse.json();
      const text = String(visionData.responses?.[0]?.fullTextAnnotation?.text ?? "");
      filenames = extractFilenameBasenamesFromOcr(text);
    } else if (process.env.OPENAI_API_KEY) {
      filenames = await extractWithOpenAi(`data:image/jpeg;base64,${imageBase64}`);
    } else {
      return NextResponse.json({ ok: false, error: "이미지 문자 인식 설정이 필요합니다." }, { status: 500 });
    }
    if (!filenames.length) {
      return NextResponse.json({
        ok: false,
        error: "이미지에서 확장자가 포함된 파일명을 찾지 못했습니다.",
      }, { status: 422 });
    }
    return NextResponse.json({
      ok: true,
      filenames,
      oneLine: formatFilenameBasenamesOneLine(filenames),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "스크린샷 문자 인식에 실패했습니다.",
    }, { status: 500 });
  }
}
