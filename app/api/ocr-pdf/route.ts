import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "GOOGLE_VISION_API_KEY 미설정" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { imageBase64 } = body; // base64 (data URL 제외)

    if (!imageBase64) {
      return NextResponse.json({ ok: false, error: "이미지 없음" }, { status: 400 });
    }

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [
                { type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 },
              ],
            },
          ],
        }),
      }
    );

    if (!visionRes.ok) {
      const err = await visionRes.text();
      return NextResponse.json({ ok: false, error: "Vision API 오류: " + err }, { status: 500 });
    }

    const data = await visionRes.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text || "";

    return NextResponse.json({ ok: true, text });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "OCR 실패" },
      { status: 500 }
    );
  }
}
