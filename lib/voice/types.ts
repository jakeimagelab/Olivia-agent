export type VoiceStatus =
  | "recording"
  | "uploading"
  | "uploaded"
  | "diarizing"
  | "summarizing"
  | "completed"
  | "transcribed"
  | "error";

export type TranscriptSegment = {
  speaker: string;
  text: string;
  start: number;
  end: number;
};

export type SpeakerHint = {
  at: number;
  speaker: string;
  confidence: number;
};

export type VoiceRecording = {
  id: string;
  title: string | null;
  status: VoiceStatus;
  device_type: string | null;
  mime_type: string | null;
  audio_path: string | null;
  duration_seconds: number;
  live_speaker_hints: SpeakerHint[];
  transcript_text: string | null;
  transcript_segments: TranscriptSegment[];
  speaker_names: Record<string, string>;
  summary: string | null;
  key_points: string[];
  action_items: string[];
  recorded_at: string;
  processed_at: string | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  audio_url?: string | null;
};

export type VoiceSummary = {
  title: string;
  summary: string;
  key_points: string[];
  action_items: string[];
};
