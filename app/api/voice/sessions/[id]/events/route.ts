import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/voice/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const EVENT_TYPES = new Set(["question_started", "highlight", "follow_up", "field_note"]);

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "녹음 ID가 올바르지 않습니다." }, { status: 400 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const eventId = typeof body.eventId === "string" ? body.eventId.trim().slice(0, 200) : "";
    const eventType = typeof body.eventType === "string" ? body.eventType : "";
    const atSeconds = typeof body.atSeconds === "number" && Number.isFinite(body.atSeconds) ? Math.max(0, body.atSeconds) : null;
    if (!eventId || !EVENT_TYPES.has(eventType) || atSeconds === null) return NextResponse.json({ error: "인터뷰 이벤트 형식이 올바르지 않습니다." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data: recording, error: recordingError } = await supabase.from("voice_recordings").select("recording_mode").eq("id", id).maybeSingle();
    if (recordingError) throw recordingError;
    if (!recording || recording.recording_mode !== "interview") return NextResponse.json({ error: "인터뷰 녹음 세션을 찾을 수 없습니다." }, { status: 404 });
    const event = {
      recording_id: id, event_id: eventId, event_type: eventType, at_seconds: atSeconds,
      question_id: typeof body.questionId === "string" ? body.questionId.slice(0, 100) : null,
      payload: body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {},
    };
    const { data, error } = await supabase.from("voice_recording_events").upsert(event, {
      onConflict: "recording_id,event_id", ignoreDuplicates: true,
    }).select("*").maybeSingle();
    if (error) throw error;
    if (data) return NextResponse.json({ event: data, duplicate: false });
    const { data: duplicate, error: duplicateError } = await supabase.from("voice_recording_events")
      .select("*").eq("recording_id", id).eq("event_id", eventId).maybeSingle();
    if (duplicateError || !duplicate) throw duplicateError || new Error("인터뷰 이벤트를 저장하지 못했습니다.");
    return NextResponse.json({ event: duplicate, duplicate: true });
  } catch (error) {
    console.error("[voice/interview/event]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "인터뷰 이벤트를 저장하지 못했습니다." }, { status: 500 });
  }
}
