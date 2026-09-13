import { NextResponse } from "next/server";
import { baseAudioMimeType, isUuid, VOICE_RECORDINGS_BUCKET } from "@/lib/voice/config";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SpeakerHint, VoiceStatus } from "@/lib/voice/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const CLIENT_STATUSES = new Set<VoiceStatus>(["recording", "uploading", "uploaded", "error"]);

function normalizeHints(value: unknown): SpeakerHint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.speaker !== "string" || typeof row.at !== "number" || typeof row.confidence !== "number") return [];
    return [{
      at: Math.max(0, Math.round(row.at)),
      speaker: row.speaker.trim().slice(0, 80),
      confidence: Math.max(0, Math.min(1, row.confidence)),
    }];
  }).filter((item) => item.speaker).slice(-1_000);
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "기록 ID가 올바르지 않습니다." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("voice_recordings").select("*").eq("id", id).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
  }

  let audioUrl: string | null = null;
  if (data.audio_path) {
    const { data: signed } = await supabase.storage
      .from(VOICE_RECORDINGS_BUCKET)
      .createSignedUrl(data.audio_path, 60 * 60);
    audioUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ ...data, audio_url: audioUrl }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "기록 ID가 올바르지 않습니다." }, { status: 400 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.status === "string" && CLIENT_STATUSES.has(body.status as VoiceStatus)) patch.status = body.status;
    if (typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)) {
      patch.duration_seconds = Math.max(0, Math.min(24 * 60 * 60, Math.round(body.durationSeconds)));
    }
    if (body.liveSpeakerHints !== undefined) patch.live_speaker_hints = normalizeHints(body.liveSpeakerHints);
    if (body.mimeType !== undefined) patch.mime_type = baseAudioMimeType(body.mimeType);
    if (typeof body.errorMessage === "string") patch.error_message = body.errorMessage.trim().slice(0, 2_000) || null;
    if (body.status === "uploaded") patch.error_message = null;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "수정할 녹음 상태가 없습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("voice_recordings")
      .update(patch)
      .eq("id", id)
      .select("id,status,duration_seconds,live_speaker_hints,mime_type")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ success: true, recording: data });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "녹음 상태 저장 실패",
    }, { status: 500 });
  }
}
