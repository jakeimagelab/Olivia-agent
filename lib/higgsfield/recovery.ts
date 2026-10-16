import type { VideoGenerationRecord, VideoGenerationStatus } from "./types";

export const HIGGSFIELD_POLL_DEADLINE_MS = 10 * 60_000;
export const HIGGSFIELD_QUEUE_TIMEOUT_RESTORE_MAX_AGE_MS = 24 * 60 * 60_000;

export function isTerminalVideoGeneration(status: VideoGenerationStatus): boolean {
  return status === "completed" || status === "failed" || status === "nsfw" || status === "canceled";
}

export function videoGenerationPollDeadline(now = Date.now()): number {
  return now + HIGGSFIELD_POLL_DEADLINE_MS;
}

export function shouldRestoreVideoGenerationWatch(record: VideoGenerationRecord, now = Date.now()): boolean {
  if (isTerminalVideoGeneration(record.status)) return false;
  if (record.status !== "queue_timeout") return true;
  const createdAt = Date.parse(record.createdAt);
  return Number.isFinite(createdAt) && now - createdAt < HIGGSFIELD_QUEUE_TIMEOUT_RESTORE_MAX_AGE_MS;
}
