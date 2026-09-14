export const PHOTO_PROJECT_STATUSES = [
  "READY", "APPROVED", "DEFERRED", "REVIEW_REQUIRED", "ERROR",
  "COPY_QUEUED", "COPYING", "COPY_VERIFYING", "COPY_COMPLETED", "COPY_FAILED",
  "CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING", "CLASSIFY_COMPLETED", "CLASSIFY_FAILED",
] as const;
export type PhotoProjectStatus = (typeof PHOTO_PROJECT_STATUSES)[number];

export const PHOTO_EVENT_TYPES = [
  "PHOTO_PROJECT_READY",
  "PHOTO_PROJECT_APPROVED",
  "PHOTO_PROJECT_DEFERRED",
  "PHOTO_PROJECT_REVIEW_REQUIRED",
  "PHOTO_PROJECT_ERROR",
  "PHOTO_COPY_STARTED",
  "PHOTO_COPY_COMPLETED",
  "PHOTO_COPY_FAILED",
  "PHOTO_CLASSIFICATION_STARTED",
  "PHOTO_CLASSIFICATION_COMPLETED",
  "PHOTO_CLASSIFICATION_FAILED",
] as const;
export type PhotoProjectEventType = (typeof PHOTO_EVENT_TYPES)[number];

export type PhotoStorageProject = {
  id: string;
  project_name: string;
  source_relative_path: string;
  status: PhotoProjectStatus;
  raw_count: number;
  jpg_count: number;
  jpg_bytes: number;
  fingerprint: string | null;
  discovered_at: string;
  prepared_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  work_relative_path: string | null;
  copy_started_at: string | null;
  copy_completed_at: string | null;
  copied_jpg_count: number;
  copied_jpg_bytes: number;
  copy_error: string | null;
  copy_progress: Record<string, unknown>;
  copy_job_id: string | null;
  scene_count: number;
  classified_jpg_count: number;
  classification_started_at: string | null;
  classification_completed_at: string | null;
  classification_error: string | null;
  classification_progress: Record<string, unknown>;
  classify_job_id: string | null;
};

export type PhotoStorageEvent = {
  id: string;
  project_id: string;
  event_type: PhotoProjectEventType;
  status: "OPEN" | "ACKNOWLEDGED";
  message: string;
  requires_action: boolean;
  payload: Record<string, unknown>;
  created_at: string;
  acknowledged_at: string | null;
};
