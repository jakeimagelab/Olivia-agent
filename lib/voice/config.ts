import type { VoiceStatus } from "@/lib/voice/types";

export const VOICE_RECORDINGS_BUCKET = "voice-recordings";
export const VOICE_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;
export const VOICE_UPLOAD_STORAGE_PREFIX = "olivia-voice-upload:";

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
]);

export const VOICE_PROCESSABLE_STATUSES = new Set<VoiceStatus>([
  "uploaded",
  "transcribed",
  "error",
]);

export function baseAudioMimeType(value: unknown): string {
  const mime = typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
  if (!ALLOWED_AUDIO_MIME_TYPES.has(mime)) return "audio/mp4";
  if (mime === "audio/x-m4a") return "audio/m4a";
  if (mime === "audio/mp3") return "audio/mpeg";
  if (mime === "audio/x-wav") return "audio/wav";
  return mime;
}

export function extensionFromMime(mime: string): "m4a" | "webm" | "mp3" | "wav" {
  const normalized = baseAudioMimeType(mime);
  if (normalized === "audio/webm") return "webm";
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "audio/wav") return "wav";
  return "m4a";
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
