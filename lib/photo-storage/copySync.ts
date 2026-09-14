import type { SupabaseClient } from "@supabase/supabase-js";
import { acknowledgePhotoStorageEvents, ensurePhotoStorageEvent, validatePhotoProjectRelativePath } from "./server";
import type { PhotoProjectStatus } from "./types";
import type { RemoteJobProgress } from "@/lib/remote-jobs/progress";

type JsonRecord = Record<string, unknown>;
type CopyJobStatus = "RUNNING" | "COMPLETED" | "FAILED";

function record(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function resultStatus(value: unknown): string | null {
  const status = record(value).status;
  return typeof status === "string" ? status.toUpperCase() : null;
}

export async function syncPhotoStageProject(
  db: SupabaseClient,
  input: {
    jobId: string;
    jobStatus: CopyJobStatus;
    payload: JsonRecord;
    progress: RemoteJobProgress | null;
    result?: unknown;
    error?: string | null;
    message?: string | null;
  },
): Promise<void> {
  const projectId = typeof input.payload.project_id === "string" ? input.payload.project_id : "";
  if (!projectId) return;
  const { data: project, error: readError } = await db.from("photo_storage_projects").select("*").eq("id", projectId).maybeSingle();
  if (readError) throw readError;
  if (!project) return;
  if (project.copy_job_id && project.copy_job_id !== input.jobId) return;

  const now = new Date().toISOString();
  const destination = typeof input.payload.destination_relative_path === "string"
    ? validatePhotoProjectRelativePath(input.payload.destination_relative_path)
    : project.work_relative_path ?? project.source_relative_path;
  const progress = input.progress ? { ...input.progress } : {};
  let status: PhotoProjectStatus;
  const patch: Record<string, unknown> = {
    work_relative_path: destination,
    copy_progress: progress,
    updated_at: now,
  };

  if (input.jobStatus === "RUNNING") {
    status = input.progress?.stage === "VERIFYING" ? "COPY_VERIFYING" : "COPYING";
    patch.status = status;
    patch.copy_started_at = project.copy_started_at ?? now;
    if (input.progress?.current !== undefined) patch.copied_jpg_count = input.progress.current;
    if (input.progress?.copiedBytes !== undefined) patch.copied_jpg_bytes = input.progress.copiedBytes;
  } else if (input.jobStatus === "COMPLETED") {
    const result = record(input.result);
    status = resultStatus(input.result) === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "COPY_COMPLETED";
    patch.status = status;
    patch.copy_completed_at = now;
    patch.copy_error = status === "COPY_COMPLETED" ? null : (typeof result.error === "string" ? result.error : "복사 결과를 확인해야 합니다.");
    patch.copied_jpg_count = nonNegativeInteger(result.sourceCount) ?? nonNegativeInteger(result.copiedCount) ?? project.copied_jpg_count ?? 0;
    patch.copied_jpg_bytes = nonNegativeInteger(result.sourceBytes) ?? nonNegativeInteger(result.copiedBytes) ?? project.copied_jpg_bytes ?? 0;
  } else {
    const result = record(input.result);
    status = resultStatus(input.result) === "REVIEW_REQUIRED"
      ? "REVIEW_REQUIRED"
      : resultStatus(input.result) === "COPY_QUEUED"
        ? "COPY_QUEUED"
        : "COPY_FAILED";
    patch.status = status;
    patch.copy_completed_at = null;
    patch.copy_error = status === "COPY_QUEUED" ? null : input.error || input.message || (typeof result.error === "string" ? result.error : "JPG 복사 중 문제가 발생했습니다. 원본은 변경되지 않았습니다.");
  }

  const { error: updateError } = await db.from("photo_storage_projects").update(patch).eq("id", projectId);
  if (updateError) throw updateError;

  if (status === "COPY_COMPLETED" || status === "COPY_FAILED" || status === "REVIEW_REQUIRED") {
    await acknowledgePhotoStorageEvents(db, projectId, status === "COPY_COMPLETED" ? "PHOTO_COPY_COMPLETED" : status === "COPY_FAILED" ? "PHOTO_COPY_FAILED" : "PHOTO_PROJECT_REVIEW_REQUIRED");
  }
  await ensurePhotoStorageEvent(db, {
    projectId,
    projectName: project.project_name,
    status,
    payload: {
      job_id: input.jobId,
      ...(input.error ? { error: input.error } : {}),
      ...(input.message ? { message: input.message } : {}),
    },
  });
}
