import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/voice/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

function importedSourceMetadata(value: unknown, durationSeconds: number, timelineDurationSeconds: number | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const originalFilename = typeof source.originalFilename === "string" ? source.originalFilename.trim().slice(0, 240) : "";
  const originalSizeBytes = typeof source.originalSizeBytes === "number" && Number.isFinite(source.originalSizeBytes)
    ? Math.max(0, Math.floor(source.originalSizeBytes))
    : null;
  if (!originalFilename || originalSizeBytes === null) return null;
  const differsMaterially = timelineDurationSeconds !== null && Math.abs(timelineDurationSeconds - durationSeconds) > Math.max(15, durationSeconds * 0.05);
  return {
    source: "iphone_import",
    originalFilename,
    originalSizeBytes,
    sourceDurationSeconds: durationSeconds,
    timelineDurationSeconds,
    markerAlignment: differsMaterially ? "unverified" : "reference",
  };
}

function validateContinuousSequences(chunks: Array<{ sequence: number; status: string }>) {
  if (chunks.length === 0) return "저장된 녹음 조각이 없습니다.";
  for (let index = 0; index < chunks.length; index += 1) {
    if (chunks[index].sequence !== index) return `${index}번 녹음 조각이 누락되었습니다.`;
    if (chunks[index].status !== "uploaded") return `${index}번 녹음 조각 업로드가 확인되지 않았습니다.`;
  }
  return null;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "녹음 ID가 올바르지 않습니다." }, { status: 400 });
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const durationSeconds = typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? Math.max(0, Math.min(24 * 60 * 60, Math.round(body.durationSeconds))) : null;
    if (durationSeconds === null) return NextResponse.json({ error: "인터뷰 녹음 시간을 확인하지 못했습니다." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data: recording, error: recordingError } = await supabase
      .from("voice_recordings").select("*").eq("id", id).maybeSingle();
    if (recordingError) throw recordingError;
    if (!recording || recording.recording_mode !== "interview") return NextResponse.json({ error: "인터뷰 녹음 세션을 찾을 수 없습니다." }, { status: 404 });
    const { data: rawChunks, error: chunksError } = await supabase.from("voice_recording_chunks")
      .select("sequence,status").eq("recording_id", id).order("sequence", { ascending: true });
    if (chunksError) throw chunksError;
    const chunkError = validateContinuousSequences(rawChunks ?? []);
    if (chunkError) {
      await supabase.from("voice_recordings").update({ audio_status: "incomplete", error_message: chunkError }).eq("id", id);
      return NextResponse.json({ error: chunkError }, { status: 409 });
    }
    const { data: rawEvents, error: eventsError } = await supabase.from("voice_recording_events")
      .select("event_type,question_id,at_seconds,payload,event_id").eq("recording_id", id).order("at_seconds", { ascending: true });
    if (eventsError) throw eventsError;
    const questionStarts = (rawEvents ?? []).filter((event) => event.event_type === "question_started" && event.question_id);
    if (questionStarts.length === 0) {
      const message = "질문 시작 표시가 없어 질문별 답변을 안전하게 정리할 수 없습니다.";
      await supabase.from("voice_recordings").update({ audio_status: "incomplete", error_message: message }).eq("id", id);
      return NextResponse.json({ error: message }, { status: 409 });
    }
    // The question companion has its own clock. It is useful context, but it
    // must never create a marker outside the uploaded source audio timeline.
    const audioTime = (value: unknown) => Math.max(0, Math.min(durationSeconds, Number(value) || 0));
    const questionMarkers = questionStarts.map((event) => ({ eventId: event.event_id, questionId: event.question_id, atSeconds: audioTime(event.at_seconds) }));
    const highlightMarkers = (rawEvents ?? []).filter((event) => event.event_type === "highlight").map((event) => ({ eventId: event.event_id, questionId: event.question_id, atSeconds: audioTime(event.at_seconds) }));
    const fieldNotes = (rawEvents ?? []).filter((event) => event.event_type === "field_note").map((event) => ({ eventId: event.event_id, questionId: event.question_id, atSeconds: audioTime(event.at_seconds), text: typeof event.payload?.text === "string" ? event.payload.text : "" }));
    const timelineDurationSeconds = typeof body.timelineDurationSeconds === "number" && Number.isFinite(body.timelineDurationSeconds)
      ? Math.max(0, Math.min(24 * 60 * 60, body.timelineDurationSeconds)) : null;
    const sourceMetadata = importedSourceMetadata(body.sourceMetadata, durationSeconds, timelineDurationSeconds);
    const now = new Date().toISOString();
    const updateValues: Record<string, unknown> = {
      status: "uploaded",
      audio_status: "stored",
      analysis_status: "pending",
      duration_seconds: durationSeconds,
      question_markers: questionMarkers,
      highlight_markers: highlightMarkers,
      field_notes: fieldNotes,
      ...(sourceMetadata ? { source_metadata: sourceMetadata } : {}),
      finalized_at: now,
      error_message: null,
    };
    let { error: updateError } = await supabase.from("voice_recordings").update(updateValues).eq("id", id);
    // The new source metadata is additive. A deployment that reaches an older
    // database must still retain and finalize the original audio successfully.
    if (updateError && sourceMetadata && (updateError.code === "PGRST204" || updateError.message.includes("source_metadata"))) {
      delete updateValues.source_metadata;
      ({ error: updateError } = await supabase.from("voice_recordings").update(updateValues).eq("id", id));
    }
    if (updateError) throw updateError;
    if (recording.interview_preparation_id) {
      const { error: preparationError } = await supabase.from("voice_interview_preparations").update({
        status: "completed", completed_at: now,
      }).eq("id", recording.interview_preparation_id);
      if (preparationError) throw preparationError;
    }
    return NextResponse.json({ success: true, id, audioStatus: "stored", analysisStatus: "pending" });
  } catch (error) {
    console.error("[voice/interview/finalize]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "인터뷰 원본을 안전하게 저장하지 못했습니다." }, { status: 500 });
  }
}
