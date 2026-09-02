import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toAsciiStorageSegment } from "@/lib/storageKey";
import { REVIEW_CONTENT_BUCKET } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const fileName = String(body.fileName || "").trim();
  const mimeType = String(body.mimeType || "");
  const fileSize = Number(body.fileSize || 0);
  const variantId = typeof body.variantId === "string" && /^[0-9a-f-]{36}$/.test(body.variantId) ? body.variantId : null;
  if (!fileName || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    return NextResponse.json({ ok: false, error: "PNG, JPG, WEBP 이미지만 업로드할 수 있습니다." }, { status: 400 });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 20 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "이미지는 20MB 이하여야 합니다." }, { status: 400 });
  }
  const id = variantId || randomUUID();
  const directory = variantId ? "variants" : "references";
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const storagePath = `${directory}/${id}/${toAsciiStorageSegment(fileName, `asset.${extension}`).slice(0, 180)}`;
  const { data, error } = await getSupabaseAdmin().storage.from(REVIEW_CONTENT_BUCKET).createSignedUploadUrl(storagePath, { upsert: true });
  if (error || !data?.token) return NextResponse.json({ ok: false, error: error?.message || "업로드 세션 생성 실패" }, { status: 500 });
  return NextResponse.json({ ok: true, bucket: REVIEW_CONTENT_BUCKET, storagePath, token: data.token });
}
