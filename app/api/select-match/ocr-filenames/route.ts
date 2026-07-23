import { NextRequest, NextResponse } from "next/server";
import { extractFilenameBasenamesFromOcr, formatFilenameBasenamesOneLine } from "@/lib/selectMatchFilenameOcr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BASE64_LENGTH = 12_000_000;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "이미지 문자 인식 설정이 필요합니다." }, { status: 500 });
  }
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
      console.error("[select-match] filename OCR failed:", visionResponse.status);
      return NextResponse.json({ ok: false, error: "스크린샷 문자 인식에 실패했습니다." }, { status: 502 });
    }
    const visionData = await visionResponse.json();
    const text = String(visionData.responses?.[0]?.fullTextAnnotation?.text ?? "");
    const filenames = extractFilenameBasenamesFromOcr(text);
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
