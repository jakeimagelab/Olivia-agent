import { NextResponse } from "next/server";
import { isUuid } from "@/lib/voice/config";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeTranscriptSegments } from "@/lib/voice/processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "기록 ID가 올바르지 않습니다." }, { status: 400 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const speaker = typeof body.speaker === "string" ? body.speaker.trim().slice(0, 120) : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!speaker || !name) {
      return NextResponse.json({ error: "speaker와 name이 필요합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error: findError } = await supabase.from("voice_recordings")
      .select("speaker_names,transcript_segments")
      .eq("id", id)
      .maybeSingle();
    if (findError) throw findError;
    if (!data) return NextResponse.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });

    const validSpeakers = new Set(normalizeTranscriptSegments(data.transcript_segments).map((segment) => segment.speaker));
    if (!validSpeakers.has(speaker)) {
      return NextResponse.json({ error: "해당 화자를 찾을 수 없습니다." }, { status: 400 });
    }

    const existing = data.speaker_names && typeof data.speaker_names === "object" && !Array.isArray(data.speaker_names)
      ? data.speaker_names as Record<string, unknown>
      : {};
    const speakerNames: Record<string, string> = {};
    for (const [key, value] of Object.entries(existing)) {
      if (typeof value === "string") speakerNames[key] = value;
    }
    speakerNames[speaker] = name;

    const { error } = await supabase.from("voice_recordings")
      .update({ speaker_names: speakerNames })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true, speaker_names: speakerNames });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "화자 이름 저장 실패",
    }, { status: 500 });
  }
}
