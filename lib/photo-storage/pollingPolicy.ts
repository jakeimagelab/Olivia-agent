import type { PhotoStorageProject } from "@/lib/photo-storage/types";
import { isPhotoProjectActionable, isPhotoProjectActive } from "@/lib/photo-storage/notificationPolicy";

export const PHOTO_PROJECT_POLL_MS = {
  active: 3_000,
  actionable: 15_000,
  hidden: 60_000,
} as const;

/** `null` deliberately means event-driven refresh only; idle pages must not burn CPU. */
export function photoProjectPollDelayMs(projects: readonly PhotoStorageProject[], hidden: boolean): number | null {
  const hasActive = projects.some(isPhotoProjectActive);
  const hasActionable = projects.some(isPhotoProjectActionable);
  if (hidden) return hasActive || hasActionable ? PHOTO_PROJECT_POLL_MS.hidden : null;
  if (hasActive) return PHOTO_PROJECT_POLL_MS.active;
  if (hasActionable) return PHOTO_PROJECT_POLL_MS.actionable;
  return null;
}
