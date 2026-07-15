import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const BUCKET = "consultation-assets";
const KINDS = {
  canvas: { field: "canvas_path", mime: ["image/png", "image/jpeg", "image/webp"], max: 15 * 1024 * 1024 },
  ai_image: { field: "ai_image_path", mime: ["image/png", "image/jpeg", "image/webp"], max: 20 * 1024 * 1024 },
  audio: { field: "audio_path", mime: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"], max: 50 * 1024 * 1024 },
} as const;

async function ensureBucket() {
  const db = getSupabaseAdmin();
  const { data } = await db.storage.listBuckets();
  if (data?.some(bucket => bucket.id === BUCKET)) return;
  const { error } = await db.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 50 * 1024 * 1024 });
  if (error && !error.message.toLowerCase().includes("already")) throw error;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const memoId = String(form.get("memo_id") || "");
    const kind = String(form.get("kind") || "") as keyof typeof KINDS;
    const duration = Math.max(0, Number(form.get("duration_seconds") || 0));
    if (!(file instanceof File) || !memoId || !KINDS[kind]) return NextResponse.json({ ok: false, error: "file, memo_id, kind가 필요합니다." }, { status: 400 });
    const config = KINDS[kind];
    if (!config.mime.includes(file.type as never)) return NextResponse.json({ ok: false, error: "지원하지 않는 파일 형식입니다." }, { status: 415 });
    if (file.size > config.max) return NextResponse.json({ ok: false, error: "파일 크기가 제한을 초과했습니다." }, { status: 413 });

    await ensureBucket();
    const db = getSupabaseAdmin();
    const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || (kind === "audio" ? "webm" : "png");
    const path = `${memoId}/${kind}-${Date.now()}.${extension}`;
    const { data: current } = await db.from("consultation_memos").select(config.field).eq("id", memoId).maybeSingle();
    if (!current) return NextResponse.json({ ok: false, error: "메모를 먼저 저장해주세요." }, { status: 404 });

    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const patch: Record<string, unknown> = { [config.field]: path };
    if (kind === "audio") patch.audio_duration_seconds = Math.round(duration);
    const { error: updateError } = await db.from("consultation_memos").update(patch).eq("id", memoId);
    if (updateError) { await db.storage.from(BUCKET).remove([path]); throw updateError; }

    const previous = (current as Record<string, unknown>)[config.field];
    if (typeof previous === "string" && previous && previous !== path) await db.storage.from(BUCKET).remove([previous]);
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    return NextResponse.json({ ok: true, path, url: signed?.signedUrl ?? null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "파일 저장 실패" }, { status: 500 });
  }
}
