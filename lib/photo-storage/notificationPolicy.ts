import type { PhotoStorageProject } from "./types";

export const ACTIVE_PHOTO_PROJECT_STATUSES = new Set<PhotoStorageProject["status"]>([
  "MERGE_APPROVED",
  "MERGING",
  "CLASSIFY_APPROVED",
  "COPY_QUEUED",
  "COPYING",
  "COPY_VERIFYING",
  "CLASSIFY_QUEUED",
  "CLASSIFYING",
  "CLASSIFY_VERIFYING",
]);

export const ACTIONABLE_PHOTO_PROJECT_STATUSES = new Set<PhotoStorageProject["status"]>([
  "READY",
  "DEFERRED",
  "MERGE_COMPLETED",
  "REVIEW_REQUIRED",
  "ERROR",
  "MERGE_FAILED",
  "COPY_FAILED",
  "CLASSIFY_FAILED",
]);

export type SceneClassificationRequirement = "required" | "not_required" | "incomplete";

export function sceneClassificationRequirement(
  project: Pick<PhotoStorageProject, "nas_department" | "nas_shooting_mode">,
): SceneClassificationRequirement {
  const hasDepartment = Boolean(project.nas_department?.trim());
  const hasShootingMode = Boolean(project.nas_shooting_mode);
  if (hasDepartment && hasShootingMode) return "required";
  if (!hasDepartment && !hasShootingMode) return "not_required";
  return "incomplete";
}

export function isPhotoProjectActive(project: Pick<PhotoStorageProject, "status">): boolean {
  return ACTIVE_PHOTO_PROJECT_STATUSES.has(project.status);
}

export function isPhotoProjectActionable(project: Pick<PhotoStorageProject, "status">): boolean {
  return ACTIONABLE_PHOTO_PROJECT_STATUSES.has(project.status);
}

export function isPhotoProjectPendingVisible(
  project: Pick<PhotoStorageProject, "status" | "notification_deferred_until" | "notification_dismissed_at">,
  nowMs = Date.now(),
): boolean {
  if (!isPhotoProjectActionable(project) || project.notification_dismissed_at) return false;
  if (!project.notification_deferred_until) return true;
  const deferredUntil = new Date(project.notification_deferred_until).getTime();
  return Number.isFinite(deferredUntil) && deferredUntil > nowMs;
}
