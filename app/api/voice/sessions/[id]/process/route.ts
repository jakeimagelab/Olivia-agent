import { NextResponse } from "next/server";
import {
  isUuid,
  VOICE_PROCESSABLE_STATUSES,
  VOICE_RECORDINGS_BUCKET,
  VOICE_TRANSCRIPTION_MAX_BYTES,
} from "@/lib/voice/config";
import { buildTranscriptText, normalizeTranscriptSegments } from "@/lib/voice/processing";
import { summarizeVoiceRecording } from "@/lib/voice/summarizer";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { TranscriptSegment, VoiceStatus } from "@/lib/voice/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };
type DiarizedResult = { text?: string; segments?: unknown };

async function markError(id: string, message: string) {
  try {
    await getSupabaseAdmin().from("voice_recordings").update({
      status: "error",
      error_message: message.slice(0, 4_000),
    }).eq("id", id);
  } catch (updateError) {
    console.error("[VOICE STATUS ERROR]", updateError);
  }
}

async function transcribeRecording(recording: Record<string, unknown>): Promise<{
  segments: TranscriptSegment[];
  transcriptText: string;
}> {
  if (typeof recording.audio_path !== "string" || !recording.audio_path) {
    throw new Error("음성 원본 경로가 없습니다.");
  }
  const supabase = getSupabaseAdmin();
  const { data: audio, error: downloadError } = await supabase.storage
    .from(VOICE_RECORDINGS_BUCKET)
    .download(recording.audio_path);
  if (downloadError || !audio) throw downloadError || new Error("녹음파일 다운로드 실패");
  if (audio.size > VOICE_TRANSCRIPTION_MAX_BYTES) {
    throw new Error("원본은 안전하게 저장됐지만 현재 버전의 AI 화자분리 한도(25MB)를 초과했습니다.");
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  const form = new FormData();
  form.append("file", audio, recording.audio_path.split("/").pop() || "meeting.m4a");
  form.append("model", "gpt-4o-transcribe-diarize");
  form.append("response_format", "diarized_json");
  form.append("chunking_strategy", "auto");

  const speakerRefPath = process.env.OLIVIA_PRIMARY_SPEAKER_REF_PATH?.trim();
  if (speakerRefPath && !speakerRefPath.includes("..") && !speakerRefPath.startsWith("/")) {
    const { data: speakerAudio } = await supabase.storage.from(VOICE_RECORDINGS_BUCKET).download(speakerRefPath);
    if (speakerAudio && speakerAudio.size > 0) {
      const buffer = Buffer.from(await speakerAudio.arrayBuffer());
      const mime = speakerAudio.type || "audio/mp4";
      form.append("known_speaker_names[]", "정연호");
      form.append("known_speaker_references[]", `data:${mime};base64,${buffer.toString("base64")}`);
    }
  }

  const openAIResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(240_000),
  });
  if (!openAIResponse.ok) {
    const detail = (await openAIResponse.text()).slice(0, 2_000);
    throw new Error(`OpenAI 음성 분석 실패 (${openAIResponse.status}): ${detail}`);
  }

  const transcription = await openAIResponse.json() as DiarizedResult;
  let segments = normalizeTranscriptSegments(transcription.segments);
  const fallbackText = typeof transcription.text === "string" ? transcription.text.trim() : "";
  if (segments.length === 0 && fallbackText) {
    segments = [{
      speaker: "speaker_0",
      text: fallbackText,
      start: 0,
      end: typeof recording.duration_seconds === "number" ? recording.duration_seconds : 0,
    }];
  }
  return { segments, transcriptText: buildTranscriptText(segments, fallbackText) };
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "기록 ID가 올바르지 않습니다." }, { status: 400 });
  const supabase = getSupabaseAdmin();

  try {
    const { data: recording, error } = await supabase.from("voice_recordings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !recording) throw error || new Error("음성 기록을 찾을 수 없습니다.");
    if (recording.status === "completed") {
      return NextResponse.json({ success: true, id, status: "completed" });
    }
    if (!VOICE_PROCESSABLE_STATUSES.has(recording.status as VoiceStatus)) {
      return NextResponse.json({
        error: recording.status === "diarizing" || recording.status === "summarizing"
          ? "음성 기록을 이미 처리하고 있습니다."
          : "원본 업로드가 완료되지 않았습니다.",
      }, { status: 409 });
    }

    let segments = normalizeTranscriptSegments(recording.transcript_segments);
    let transcriptText = typeof recording.transcript_text === "string" ? recording.transcript_text.trim() : "";
    if (!transcriptText) {
      await supabase.from("voice_recordings").update({ status: "diarizing", error_message: null }).eq("id", id);
      const transcription = await transcribeRecording(recording);
      segments = transcription.segments;
      transcriptText = transcription.transcriptText;
      await supabase.from("voice_recordings").update({
        status: "summarizing",
        transcript_text: transcriptText,
        transcript_segments: segments,
        error_message: null,
      }).eq("id", id);
    } else {
      await supabase.from("voice_recordings").update({ status: "summarizing", error_message: null }).eq("id", id);
    }

    if (!transcriptText) {
      await supabase.from("voice_recordings").update({
        title: recording.title || "음성 기록",
        status: "transcribed",
        transcript_segments: segments,
        processed_at: new Date().toISOString(),
        error_message: "인식 가능한 음성이 없습니다.",
      }).eq("id", id);
      return NextResponse.json({ success: true, id, status: "transcribed" });
    }

    try {
      const organizedResult = await summarizeVoiceRecording(id, transcriptText);
      const organized = organizedResult.summary;
      const { error: updateError } = await supabase.from("voice_recordings").update({
        title: organized.title || recording.title || "음성 기록",
        summary: organized.summary,
        key_points: organized.key_points,
        action_items: organized.action_items,
        status: "completed",
        processed_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", id);
      if (updateError) throw updateError;
      return NextResponse.json({
        success: true,
        id,
        status: "completed",
        summaryProvider: organizedResult.provider,
      });
    } catch (summaryError) {
      console.error("[VOICE SUMMARY]", summaryError);
      await supabase.from("voice_recordings").update({
        status: "transcribed",
        processed_at: new Date().toISOString(),
        error_message: summaryError instanceof Error
          ? `내용 정리 대기: ${summaryError.message}`.slice(0, 4_000)
          : "내용 정리 대기",
      }).eq("id", id);
      return NextResponse.json({ success: true, id, status: "transcribed", summaryPending: true });
    }
  } catch (error) {
    console.error("[VOICE PROCESS]", error);
    const message = error instanceof Error ? error.message : "음성 처리 실패";
    await markError(id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
