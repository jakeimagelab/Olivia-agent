import { NextRequest, NextResponse } from "next/server";
import { analyzePhotoColor, type PhotoColorCheckType } from "@/lib/photoRetouch/colorCheckService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const imageMime = typeof body.imageMime === "string" ? body.imageMime : "image/jpeg";
    const checkType: PhotoColorCheckType = body.checkType === "gown" ? "gown" : "skin";
    if (!imageBase64) return NextResponse.json({ ok: false, error: "이미지 없음" }, { status: 400 });
    return NextResponse.json(await analyzePhotoColor({ imageBase64, imageMime, checkType }));
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "보정 분석에 실패했습니다." }, { status: 500 });
  }
}
