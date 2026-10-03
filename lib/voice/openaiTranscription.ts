import { getSupabaseAdmin } from "@/lib/supabase";
import { VOICE_RECORDINGS_BUCKET } from "./config";
import { buildTranscriptText, normalizeTranscriptSegments } from "./processing";
import type { TranscriptSegment } from "./types";

type OpenAITranscriptionPayload = { text?: string; segments?: unknown };
type TranscriptionMode = "diarized" | "single_speaker_fallback";

export type OpenAITranscript = {
  segments: TranscriptSegment[];
  transcriptText: string;
  mode: TranscriptionMode;
};

type OpenAIErrorDetail = { status: number; code: string | null; message: string };

async function errorDetail(response: Response): Promise<OpenAIErrorDetail> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown; code?: unknown } };
    const message = typeof parsed.error?.message === "string" ? parsed.error.message : raw;
    const code = typeof parsed.error?.code === "string" ? parsed.error.code : null;
    return { status: response.status, code, message: message.slice(0, 1_000) };
  } catch {
    return { status: response.status, code: null, message: raw.slice(0, 1_000) || "OpenAI가 상세 오류를 반환하지 않았습니다." };
  }
}

async function knownSpeakerReference(): Promise<{ name: string; dataUrl: string } | null> {
  const path = process.env.OLIVIA_PRIMARY_SPEAKER_REF_PATH?.trim();
  if (!path || path.includes("..") || path.startsWith("/")) return null;
  const { data } = await getSupabaseAdmin().storage.from(VOICE_RECORDINGS_BUCKET).download(path);
  if (!data || data.size <= 0) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return { name: "정연호", dataUrl: `data:${data.type || "audio/mp4"};base64,${buffer.toString("base64")}` };
}

async function requestTranscription({
  apiKey,
  audio,
  filename,
  diarize,
}: {
  apiKey: string;
  audio: Blob;
  filename: string;
  diarize: boolean;
}): Promise<Response> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", diarize ? "gpt-4o-transcribe-diarize" : "gpt-transcribe");
  if (diarize) {
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
    const speaker = await knownSpeakerReference();
    if (speaker) {
      form.append("known_speaker_names[]", speaker.name);
      form.append("known_speaker_references[]", speaker.dataUrl);
    }
  }
  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(240_000),
  });
}

function transcriptFromPayload(payload: OpenAITranscriptionPayload, durationSeconds: number) {
  let segments = normalizeTranscriptSegments(payload.segments);
  const fallbackText = typeof payload.text === "string" ? payload.text.trim() : "";
  if (segments.length === 0 && fallbackText) {
    segments = [{ speaker: "speaker_0", text: fallbackText, start: 0, end: Math.max(0, durationSeconds) }];
  }
  return { segments, transcriptText: buildTranscriptText(segments, fallbackText) };
}

/**
 * Speaker diarization is valuable for interviews but can be unavailable to a
 * project or reject a particular source. A regular transcript is preferable
 * to losing an already stored original; auth, billing and rate-limit errors
 * intentionally do not retry through another model.
 */
export async function transcribeStoredAudio({
  audio,
  filename,
  durationSeconds,
}: {
  audio: Blob;
  filename: string;
  durationSeconds: number;
}): Promise<OpenAITranscript> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");

  const diarized = await requestTranscription({ apiKey, audio, filename, diarize: true });
  if (diarized.ok) {
    const payload = await diarized.json() as OpenAITranscriptionPayload;
    return { ...transcriptFromPayload(payload, durationSeconds), mode: "diarized" };
  }

  const diarizationError = await errorDetail(diarized);
  const mayFallback = [400, 404, 422].includes(diarizationError.status);
  console.error("[VOICE TRANSCRIPTION]", JSON.stringify({
    stage: "diarization",
    status: diarizationError.status,
    code: diarizationError.code,
    message: diarizationError.message,
    fileBytes: audio.size,
    fallback: mayFallback,
  }));
  if (!mayFallback) {
    throw new Error(`OpenAI 음성 분석 실패 (${diarizationError.status}${diarizationError.code ? `/${diarizationError.code}` : ""}): ${diarizationError.message}`);
  }

  const regular = await requestTranscription({ apiKey, audio, filename, diarize: false });
  if (!regular.ok) {
    const regularError = await errorDetail(regular);
    console.error("[VOICE TRANSCRIPTION]", JSON.stringify({
      stage: "regular_fallback",
      status: regularError.status,
      code: regularError.code,
      message: regularError.message,
      fileBytes: audio.size,
      fallback: false,
    }));
    throw new Error(`OpenAI 음성 분석 실패 (${regularError.status}${regularError.code ? `/${regularError.code}` : ""}): ${regularError.message}`);
  }
  const payload = await regular.json() as OpenAITranscriptionPayload;
  return { ...transcriptFromPayload(payload, durationSeconds), mode: "single_speaker_fallback" };
}
