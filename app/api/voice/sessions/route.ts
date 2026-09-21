import { NextRequest, NextResponse } from "next/server";
import { baseAudioMimeType, extensionFromMime, VOICE_RECORDINGS_BUCKET } from "@/lib/voice/config";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_TYPES = new Set(["iphone", "ipad", "android-mobile", "android-tablet", "desktop", "unknown"]);
const LIST_COLUMNS = "id,title,status,duration_seconds,summary,recorded_at,processed_at";

// docs/tablet-ipad-home-memo-voice-spec.md §6-7 — 지금까지 지난 녹음을 다시 찾아볼 방법이
// 없었다(조회 API 자체가 없었음). 목록은 가벼운 컬럼만 돌려주고(transcript_segments 등 큰
// 필드는 상세 조회(GET /api/voice/sessions/[id])에서만 가져온다), 최신순으로 최대 50건.
export async function GET(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 100) : 50;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("voice_recordings")
      .select(LIST_COLUMNS)
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ recordings: data ?? [] });
  } catch (error) {
    console.error("[VOICE SESSIONS LIST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "음성 기록 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

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
