import { buildTranscriptText } from "@/lib/voice/processing";
import { getSupabaseAdmin } from "@/lib/supabase";
import { VOICE_RECORDINGS_BUCKET, VOICE_TRANSCRIPTION_MAX_BYTES } from "@/lib/voice/config";
import { transcribeStoredAudio } from "@/lib/voice/openaiTranscription";
import type { TranscriptSegment } from "@/lib/voice/types";
import type { InterviewQuestionSnapshot } from "@/lib/voice/interview/types";

type StoredChunk = { sequence: number; storage_path: string; start_seconds: number; end_seconds: number; mime_type: string; size_bytes: number };

async function transcribeChunk(chunk: StoredChunk): Promise<TranscriptSegment[]> {
  const supabase = getSupabaseAdmin();
  const { data: audio, error: downloadError } = await supabase.storage.from(VOICE_RECORDINGS_BUCKET).download(chunk.storage_path);
  if (downloadError || !audio) throw downloadError || new Error(`${chunk.sequence}번 녹음 조각을 다운로드하지 못했습니다.`);
  if (audio.size > VOICE_TRANSCRIPTION_MAX_BYTES) throw new Error(`${chunk.sequence + 1}번 원본 파일이 AI 전사 한도(25MB)를 초과했습니다.`);
  const transcription = await transcribeStoredAudio({
    audio,
    filename: chunk.storage_path.split("/").pop() || `chunk-${chunk.sequence}.m4a`,
    durationSeconds: Math.max(0, chunk.end_seconds - chunk.start_seconds),
  });
  return transcription.segments.map((segment) => ({ ...segment, start: segment.start + chunk.start_seconds, end: segment.end + chunk.start_seconds }));
}

export async function transcribeInterviewChunks(recordingId: string): Promise<{ segments: TranscriptSegment[]; transcriptText: string }> {
  const supabase = getSupabaseAdmin();
  const { data: rawChunks, error } = await supabase.from("voice_recording_chunks")
    .select("sequence,storage_path,start_seconds,end_seconds,mime_type,size_bytes")
    .eq("recording_id", recordingId).eq("status", "uploaded").order("sequence", { ascending: true });
  if (error) throw error;
  const chunks = (rawChunks ?? []) as StoredChunk[];
  if (chunks.length === 0) throw new Error("전사할 저장된 녹음 조각이 없습니다.");
  const all: TranscriptSegment[] = [];
  for (const chunk of chunks) all.push(...await transcribeChunk(chunk));
  const segments = all.sort((left, right) => left.start - right.start || left.end - right.end);
  return { segments, transcriptText: buildTranscriptText(segments) };
}

export function selectedInterviewQuestions(value: unknown): InterviewQuestionSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const question = item as Partial<InterviewQuestionSnapshot>;
    if (typeof question.id !== "string" || typeof question.text !== "string" || typeof question.order !== "number") return [];
    return [question as InterviewQuestionSnapshot];
  }).sort((left, right) => left.order - right.order);
}
