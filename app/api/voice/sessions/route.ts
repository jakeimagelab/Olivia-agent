import { NextResponse } from "next/server";
import { baseAudioMimeType, extensionFromMime, VOICE_RECORDINGS_BUCKET } from "@/lib/voice/config";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_TYPES = new Set(["iphone", "ipad", "android-mobile", "android-tablet", "desktop", "unknown"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = crypto.randomUUID();
    const mimeType = baseAudioMimeType(body.mimeType);
    const extension = extensionFromMime(mimeType);
    const deviceType = typeof body.deviceType === "string" && DEVICE_TYPES.has(body.deviceType)
      ? body.deviceType
      : "unknown";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const now = new Date();
    const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${extension}`;
    const supabase = getSupabaseAdmin();

    const { error: insertError } = await supabase.from("voice_recordings").insert({
      id,
      title: title || null,
      status: "recording",
      device_type: deviceType,
      mime_type: mimeType,
      audio_path: path,
      recorded_at: now.toISOString(),
    });
    if (insertError) throw insertError;

    const { data, error } = await supabase.storage
      .from(VOICE_RECORDINGS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data?.token) {
      await supabase.from("voice_recordings").update({
        status: "error",
        error_message: error?.message || "Upload URL 생성 실패",
      }).eq("id", id);
      throw error || new Error("Upload URL 생성 실패");
    }

    return NextResponse.json({
      id,
      path,
      uploadToken: data.token,
      mimeType,
    });
  } catch (error) {
    console.error("[VOICE SESSION CREATE]", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "음성 세션 생성 실패",
    }, { status: 500 });
  }
}
