import type { SupabaseClient } from "@supabase/supabase-js";
import { acknowledgePhotoStorageEvents, ensurePhotoStorageEvent } from "./server";
import type { PhotoProjectStatus } from "./types";
import type { RemoteJobProgress } from "@/lib/remote-jobs/progress";

type JsonRecord = Record<string, unknown>;
type MergeJobStatus = "RUNNING" | "COMPLETED" | "FAILED";

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

export async function syncPhotoMergeProject(
  db: SupabaseClient,
  input: {
    jobId: string;
    jobStatus: MergeJobStatus;
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
  if (project.merge_job_id && project.merge_job_id !== input.jobId) return;

  const now = new Date().toISOString();
  const progress = input.progress ? { ...input.progress } : {};
  const patch: Record<string, unknown> = {
    merge_progress: progress,
    updated_at: now,
  };
  let status: PhotoProjectStatus;

  if (input.jobStatus === "RUNNING") {
    status = "MERGING";
    patch.status = status;
    patch.merge_started_at = project.merge_started_at ?? now;
  } else if (input.jobStatus === "COMPLETED") {
    const result = record(input.result);
    const mergeCompleted = resultStatus(input.result) !== "REVIEW_REQUIRED";
    // 채팅의 start_photo_scene_sort, 기존 nas_backup_start_sort, 알림 버튼은 모두 같은 helper에서
    // 후속 분류 승인을 classify_approved_at에 미리 기록한다. 그 승인이 있을 때만 JPG 통합 완료
    // 직후 기존 COPY claim 상태로 넘긴다. 원본 분리만 승인한 요청은 MERGE_COMPLETED에서 멈춘다.
    const continueFullPipeline = mergeCompleted
      && Boolean(project.classify_approved_at)
      && Boolean(project.nas_department)
      && Boolean(project.nas_shooting_mode);
    status = !mergeCompleted ? "REVIEW_REQUIRED" : continueFullPipeline ? "CLASSIFY_APPROVED" : "MERGE_COMPLETED";
    patch.status = status;
    patch.merge_completed_at = now;
    if (mergeCompleted) {
      patch.merge_error = null;
      patch.merge_conflict_count = 0;
      patch.merged_jpg_count = (nonNegativeInteger(result.jpgMoved) ?? 0) + (nonNegativeInteger(result.jpgAlreadyPrepared) ?? 0);
      patch.raw_untouched_count = nonNegativeInteger(result.rawUntouched) ?? project.raw_untouched_count ?? 0;
    } else {
      const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
      patch.merge_conflict_count = conflicts.length;
      patch.merge_error = typeof result.error === "string" ? result.error : "JPG 통합 중 충돌이 발견되었습니다.";
      patch.raw_untouched_count = nonNegativeInteger(result.rawUntouched) ?? project.raw_untouched_count ?? 0;
    }
  } else {
    const result = record(input.result);
    status = "MERGE_FAILED";
    patch.status = status;
    patch.merge_completed_at = null;
    patch.merge_error = input.error || input.message || (typeof result.error === "string" ? result.error : "JPG 통합 중 문제가 발생했습니다. 원본은 변경되지 않았습니다.");
  }

  const { error: updateError } = await db.from("photo_storage_projects").update(patch).eq("id", projectId);
  if (updateError) throw updateError;

  if (status === "MERGE_COMPLETED" || status === "CLASSIFY_APPROVED" || status === "MERGE_FAILED" || status === "REVIEW_REQUIRED") {
    await acknowledgePhotoStorageEvents(
      db,
      projectId,
      status === "MERGE_COMPLETED"
        ? "PHOTO_MERGE_COMPLETED"
        : status === "CLASSIFY_APPROVED"
          ? "PHOTO_PROJECT_CLASSIFY_APPROVED"
          : status === "MERGE_FAILED"
            ? "PHOTO_MERGE_FAILED"
            : "PHOTO_PROJECT_REVIEW_REQUIRED",
    );
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
