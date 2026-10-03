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
  capture_quality?: {
    requestedSampleRate: number;
    requestedChannelCount: number;
    requestedBitsPerSecond: number;
    actualSampleRate: number | null;
    actualChannelCount: number | null;
    actualBitsPerSecond: number | null;
    mimeType: string | null;
  } | null;
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
  recording_mode?: "general" | "interview";
  audio_status?: "recording" | "uploading" | "stored" | "incomplete" | null;
  analysis_status?: "pending" | "transcribing" | "summarizing" | "completed" | "failed" | null;
  interviewee_name?: string | null;
  selected_questions?: Array<{ id: string; number: number; sectionTitle: string; text: string; order: number; type: "brand" | "feedback" }>;
  question_markers?: Array<{ eventId: string; questionId: string; atSeconds: number }>;
  highlight_markers?: Array<{ eventId: string; questionId: string; atSeconds: number }>;
  field_notes?: Array<{ eventId: string; questionId: string; atSeconds: number; text: string }>;
  interview_result?: Record<string, unknown> | null;
  audio_chunks?: Array<{ sequence: number; start_seconds: number; end_seconds: number; audio_url: string | null }>;
  source_metadata?: {
    source?: "iphone_import" | "browser_legacy";
    originalFilename?: string;
    originalSizeBytes?: number;
    sourceDurationSeconds?: number;
    timelineDurationSeconds?: number;
    markerAlignment?: "reference" | "unverified";
  } | null;
};

export type VoiceSummary = {
  title: string;
  summary: string;
  key_points: string[];
  action_items: string[];
};
