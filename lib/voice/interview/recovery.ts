import type { InterviewRecoveryState } from "@/lib/voice/interview/types";

export const VOICE_INTERVIEW_RECOVERY_STORAGE_PREFIX = "olivia-voice-interview:";

export function interviewRecoveryStorageKey(recordingId: string) {
  return `${VOICE_INTERVIEW_RECOVERY_STORAGE_PREFIX}${recordingId}`;
}

export function normalizeInterviewRecoveryState(value: unknown): InterviewRecoveryState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const string = (key: string) => typeof source[key] === "string" ? source[key].trim() : "";
  const preparationId = string("preparationId");
  const versionId = string("versionId");
  const recordingId = string("recordingId");
  if (!preparationId || !versionId || !recordingId || source.mode !== "interview") return null;
  const uploadedSequences = Array.isArray(source.uploadedSequences)
    ? Array.from(new Set(source.uploadedSequences.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry) && entry >= 0))).sort((a, b) => a - b)
    : [];
  return {
    version: 1,
    preparationId,
    versionId,
    recordingId,
    mode: "interview",
    currentChunk: typeof source.currentChunk === "number" && Number.isInteger(source.currentChunk) && source.currentChunk >= 0 ? source.currentChunk : uploadedSequences.length,
    uploadedSequences,
    selectedQuestions: Array.isArray(source.selectedQuestions) ? source.selectedQuestions as InterviewRecoveryState["selectedQuestions"] : [],
    questionMarkers: Array.isArray(source.questionMarkers) ? source.questionMarkers as InterviewRecoveryState["questionMarkers"] : [],
    highlightMarkers: Array.isArray(source.highlightMarkers) ? source.highlightMarkers as InterviewRecoveryState["highlightMarkers"] : [],
    fieldNotes: Array.isArray(source.fieldNotes) ? source.fieldNotes as InterviewRecoveryState["fieldNotes"] : [],
    followUps: Array.isArray(source.followUps) ? source.followUps as InterviewRecoveryState["followUps"] : [],
    updatedAt: string("updatedAt") || new Date(0).toISOString(),
  };
}

export function nextMissingChunkSequence(uploadedSequences: number[], from = 0): number {
  const uploaded = new Set(uploadedSequences);
  let sequence = Math.max(0, from);
  while (uploaded.has(sequence)) sequence += 1;
  return sequence;
}
