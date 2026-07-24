import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toAsciiStorageSegment } from "@/lib/storageKey";
import { REVIEW_CONTENT_BUCKET } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json();
  const fileName = String(body.fileName || "").trim();
  const mimeType = String(body.mimeType || "");
  const fileSize = Number(body.fileSize || 0);
  if (!fileName || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    return NextResponse.json({ ok: false, error: "PNG, JPG, WEBP 이미지만 등록할 수 있습니다." }, { status: 400 });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 15 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "이미지는 15MB 이하여야 합니다." }, { status: 400 });
  }
  const id = randomUUID();
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const storagePath = `references/${id}/${toAsciiStorageSegment(fileName, `layout.${extension}`).slice(0, 180)}`;
  const { data, error } = await getSupabaseAdmin().storage
    .from(REVIEW_CONTENT_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data?.token) {
    return NextResponse.json({ ok: false, error: error?.message || "업로드 세션 생성 실패" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, bucket: REVIEW_CONTENT_BUCKET, storagePath, token: data.token });
}
