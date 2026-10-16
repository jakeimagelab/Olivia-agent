import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensureBgmBucket, safeBgmStorageKey, validateBgmUpload, VIDEO_CONTI_BGM_BUCKET } from "@/lib/video-conti/bgm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json().catch(() => null) as { videoContiId?: unknown; fileName?: unknown; contentType?: unknown; size?: unknown } | null;
    const videoContiId = typeof body?.videoContiId === "string" ? body.videoContiId.trim() : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const size = Number(body?.size);
    if (!videoContiId || !/^[a-zA-Z0-9_-]+$/.test(videoContiId)) return NextResponse.json({ ok: false, error: "videoContiId가 올바르지 않습니다" }, { status: 400 });
    validateBgmUpload(fileName, size);
    await ensureBgmBucket();
    const storagePath = `${videoContiId}/${Date.now()}_${safeBgmStorageKey(fileName)}`;
    const { data, error } = await getSupabaseAdmin().storage.from(VIDEO_CONTI_BGM_BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data?.token || !data.signedUrl) throw error || new Error("업로드 주소를 만들지 못했습니다");
    return NextResponse.json({ ok: true, bucket: VIDEO_CONTI_BGM_BUCKET, storagePath, token: data.token, signedUrl: data.signedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "업로드 주소를 만들지 못했습니다";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("파일만") || message.includes("50MB") ? 400 : 500 });
  }
}
