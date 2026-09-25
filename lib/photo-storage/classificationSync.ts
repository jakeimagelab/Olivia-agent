import type { SupabaseClient } from "@supabase/supabase-js";
import { acknowledgePhotoStorageEvents, ensurePhotoStorageEvent, validatePhotoProjectRelativePath } from "./server";
import type { PhotoProjectStatus } from "./types";
import type { RemoteJobProgress } from "@/lib/remote-jobs/progress";
import { completeSceneSort } from "@/lib/core/commands/photo";

type JsonRecord = Record<string, unknown>;
type ClassifyJobStatus = "RUNNING" | "COMPLETED" | "FAILED";

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

export async function syncPhotoClassificationProject(
  db: SupabaseClient,
  input: {
    jobId: string;
    jobStatus: ClassifyJobStatus;
    payload: JsonRecord;
    progress: RemoteJobProgress | null;
    result?: unknown;
    error?: string | null;
    message?: string | null;
  },
): Promise<void> {
  const projectId = typeof input.payload.project_id === "string" ? input.payload.project_id : "";
  if (!projectId) return;
  const { data: project, error: readError } = await db
    .from("photo_storage_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (readError) throw readError;
  if (!project) return;
  if (project.classify_job_id && project.classify_job_id !== input.jobId) return;

  const workPath = typeof input.payload.work_relative_path === "string"
    ? validatePhotoProjectRelativePath(input.payload.work_relative_path)
    : project.work_relative_path;
  if (!workPath) throw new Error("분류 작업 경로가 없습니다.");

  const now = new Date().toISOString();
  const progress = input.progress ? { ...input.progress } : {};
  const patch: Record<string, unknown> = {
    work_relative_path: workPath,
    classification_progress: progress,
    updated_at: now,
  };
  let status: PhotoProjectStatus;

  if (input.jobStatus === "RUNNING") {
    status = input.progress?.stage === "VERIFYING" ? "CLASSIFY_VERIFYING" : "CLASSIFYING";
    patch.status = status;
    patch.classification_started_at = project.classification_started_at ?? now;
    if (input.progress?.current !== undefined) patch.classified_jpg_count = input.progress.current;
  } else if (input.jobStatus === "COMPLETED") {
    const result = record(input.result);
    status = resultStatus(input.result) === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "CLASSIFY_COMPLETED";
    patch.status = status;
    patch.classification_completed_at = now;
    patch.classification_error = status === "CLASSIFY_COMPLETED"
      ? null
      : (typeof result.error === "string" ? result.error : "분류 결과를 확인해야 합니다.");
    patch.scene_count = nonNegativeInteger(result.sceneCount) ?? project.scene_count ?? 0;
    patch.classified_jpg_count = nonNegativeInteger(result.jpgCount)
      ?? nonNegativeInteger(result.classifiedJpgCount)
      ?? project.classified_jpg_count
      ?? 0;
  } else {
    const result = record(input.result);
    status = resultStatus(input.result) === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "CLASSIFY_FAILED";
    patch.status = status;
    patch.classification_completed_at = null;
    patch.classification_error = input.error
      || input.message
      || (typeof result.error === "string" ? result.error : "사진 분류 중 문제가 발생했습니다.");
  }

  const { error: updateError } = await db
    .from("photo_storage_projects")
    .update(patch)
    .eq("id", projectId)
    .eq("classify_job_id", input.jobId);
  if (updateError) throw updateError;

  if (status === "CLASSIFY_COMPLETED" || status === "CLASSIFY_FAILED" || status === "REVIEW_REQUIRED") {
    await acknowledgePhotoStorageEvents(db, projectId);
  }
  if (status === "CLASSIFY_COMPLETED") {
    const workflowResult = await completeSceneSort(db, projectId);
    if (!workflowResult.ok) {
      status = "REVIEW_REQUIRED";
      const { error: workflowSyncError } = await db.from("photo_storage_projects")
        .update({ status, classification_error: workflowResult.reason, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (workflowSyncError) throw workflowSyncError;
    }
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
