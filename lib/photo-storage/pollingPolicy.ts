import type { PhotoStorageProject } from "@/lib/photo-storage/types";

const ACTIVE_STATUSES = new Set<PhotoStorageProject["status"]>([
  "MERGE_APPROVED", "MERGING", "CLASSIFY_APPROVED", "COPY_QUEUED", "COPYING", "COPY_VERIFYING", "CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING",
]);

const ACTIONABLE_STATUSES = new Set<PhotoStorageProject["status"]>([
  "READY", "MERGE_COMPLETED", "REVIEW_REQUIRED", "ERROR", "MERGE_FAILED", "COPY_FAILED", "CLASSIFY_FAILED",
]);

export const PHOTO_PROJECT_POLL_MS = {
  active: 3_000,
  actionable: 15_000,
  hidden: 60_000,
} as const;

/** `null` deliberately means event-driven refresh only; idle pages must not burn CPU. */
export function photoProjectPollDelayMs(projects: readonly PhotoStorageProject[], hidden: boolean): number | null {
  const hasActive = projects.some((project) => ACTIVE_STATUSES.has(project.status));
  const hasActionable = projects.some((project) => ACTIONABLE_STATUSES.has(project.status));
  if (hidden) return hasActive || hasActionable ? PHOTO_PROJECT_POLL_MS.hidden : null;
  if (hasActive) return PHOTO_PROJECT_POLL_MS.active;
  if (hasActionable) return PHOTO_PROJECT_POLL_MS.actionable;
  return null;
}
