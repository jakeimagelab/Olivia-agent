import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePhotoProjectRelativePath } from "./server";
import type { PhotoStorageProject } from "./types";

// 채팅 도구와 NAS 알림 버튼이 공유하는 단 하나의 프로젝트 시작 경로다. 실제 파일 작업은 하지
// 않고 기존 remote job 상태 머신에 승인 상태만 기록한다.

const MERGE_FAILURE_STATUSES = new Set(["REVIEW_REQUIRED", "ERROR", "MERGE_FAILED"]);
const ACTIVE_AFTER_MERGE_STATUSES = new Set([
  "CLASSIFY_APPROVED", "COPY_QUEUED", "COPYING", "COPY_VERIFYING", "COPY_COMPLETED",
  "CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING", "CLASSIFY_COMPLETED",
]);

export class PhotoPipelineStartError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PhotoPipelineStartError";
  }
}

type PhotoProjectStartBase = {
  folderName: string;
  rawCount?: number;
  jpgCount?: number;
  jpgBytes?: number;
  confirmRestart?: boolean;
  approvedBy?: string;
};

export type StartNasBackupClassificationInput = PhotoProjectStartBase & {
  department: string;
  shootingMode: "field" | "studio";
};

export type StartPhotoSourcePreparationInput = PhotoProjectStartBase;

function countPatch(input: PhotoProjectStartBase): Record<string, number> {
  return {
    ...(input.rawCount === undefined ? {} : { raw_count: input.rawCount }),
    ...(input.jpgCount === undefined ? {} : { jpg_count: input.jpgCount }),
    ...(input.jpgBytes === undefined ? {} : { jpg_bytes: input.jpgBytes }),
  };
}

function requireRestartConfirmation(existing: PhotoStorageProject, input: PhotoProjectStartBase): void {
  if (input.confirmRestart) return;
  throw new PhotoPipelineStartError(
    `"${existing.project_name}"은(는) ${existing.status} 상태예요. 다시 시도하려면 사용자 확인이 필요합니다.`,
    "PHOTO_PROJECT_RESTART_CONFIRMATION_REQUIRED",
    { projectId: existing.id, projectName: existing.project_name, status: existing.status },
  );
}

export async function readExistingPhotoProject(db: SupabaseClient, sourceRelativePath: string): Promise<PhotoStorageProject | null> {
  const { data, error } = await db
    .from("photo_storage_projects")
    .select("*")
    .eq("source_relative_path", sourceRelativePath)
    .maybeSingle();
  if (error) throw error;
  return data as PhotoStorageProject | null;
}

async function saveProject(
  db: SupabaseClient,
  existing: PhotoStorageProject | null,
  insert: Record<string, unknown>,
  patch: Record<string, unknown>,
): Promise<PhotoStorageProject> {
  const query = existing
    ? db.from("photo_storage_projects").update(patch).eq("id", existing.id)
    : db.from("photo_storage_projects").insert(insert);
  const { data, error } = await query.select("*").single();
  if (error || !data) throw error ?? new Error("촬영 프로젝트 저장에 실패했습니다.");
  return data as PhotoStorageProject;
}

/** 명시적인 JPG 통합 승인. SSD2 복사·Scene 분류는 승인하지 않는다. */
export async function startPhotoSourcePreparation(
  db: SupabaseClient,
  input: StartPhotoSourcePreparationInput,
): Promise<PhotoStorageProject> {
  const sourceRelativePath = validatePhotoProjectRelativePath(input.folderName);
  const existing = await readExistingPhotoProject(db, sourceRelativePath);
  const now = new Date().toISOString();

  if (existing?.status === "MERGE_COMPLETED") requireRestartConfirmation(existing, input);
  if (existing && MERGE_FAILURE_STATUSES.has(existing.status)) requireRestartConfirmation(existing, input);
  if (existing && (ACTIVE_AFTER_MERGE_STATUSES.has(existing.status) || ["MERGE_APPROVED", "MERGING"].includes(existing.status))) {
    return existing;
  }

  const patch = {
    ...countPatch(input),
    status: "MERGE_APPROVED",
    merge_approved_at: now,
    merge_error: null,
    updated_at: now,
  };
  return saveProject(db, existing, {
    ...patch,
    project_name: input.folderName,
    source_relative_path: sourceRelativePath,
    discovered_at: now,
    raw_count: input.rawCount ?? 0,
    jpg_count: input.jpgCount ?? 0,
    jpg_bytes: input.jpgBytes ?? 0,
  }, patch);
}

export async function startNasBackupClassification(
  db: SupabaseClient,
  input: StartNasBackupClassificationInput,
): Promise<PhotoStorageProject> {
  const sourceRelativePath = validatePhotoProjectRelativePath(input.folderName);
  const now = new Date().toISOString();
  const existing = await readExistingPhotoProject(db, sourceRelativePath);

  // 이미 분류 job이 시작됐거나 끝난 프로젝트는 설정과 updated_at조차 다시 쓰지 않는다.
  // 중복 클릭이 진행 중인 job의 department/shootingMode를 바꾸면 안 된다.
  if (existing && ["CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING", "CLASSIFY_COMPLETED"].includes(existing.status)) {
    return existing;
  }
  const alreadyApprovedForFullPipeline = Boolean(
    existing?.classify_approved_at && existing.nas_department && existing.nas_shooting_mode,
  );
  if (existing && alreadyApprovedForFullPipeline && [
    "MERGE_APPROVED", "MERGING", "CLASSIFY_APPROVED", "COPY_QUEUED", "COPYING", "COPY_VERIFYING", "COPY_COMPLETED",
  ].includes(existing.status)) {
    return existing;
  }

  if (existing && ["ERROR", "REVIEW_REQUIRED", "MERGE_FAILED", "COPY_FAILED", "CLASSIFY_FAILED"].includes(existing.status)) {
    requireRestartConfirmation(existing, input);
  }

  let nextStatus = existing?.status ?? "MERGE_APPROVED";
  if (!existing || ["READY", "DEFERRED", "ERROR", "REVIEW_REQUIRED", "MERGE_FAILED"].includes(nextStatus)) {
    nextStatus = "MERGE_APPROVED";
  } else if (nextStatus === "MERGE_COMPLETED" || nextStatus === "COPY_FAILED") {
    nextStatus = "CLASSIFY_APPROVED";
  } else if (nextStatus === "CLASSIFY_FAILED") {
    // COPY 결과는 이미 검증됐으므로 기존 분류 재시도 진입점(COPY_COMPLETED)을 재사용한다.
    nextStatus = "COPY_COMPLETED";
  }

  const patch: Record<string, unknown> = {
    ...countPatch(input),
    nas_department: input.department,
    nas_shooting_mode: input.shootingMode,
    // JPG 통합이 먼저 필요한 프로젝트도 후속 COPY·분류 승인을 잃지 않도록 미리 기록한다.
    classify_approved_at: existing?.classify_approved_at ?? now,
    approved_at: existing?.approved_at ?? now,
    approved_by: existing?.approved_by ?? input.approvedBy ?? "olivia",
    status: nextStatus,
    updated_at: now,
  };
  if (nextStatus === "MERGE_APPROVED") {
    patch.merge_approved_at = now;
    patch.merge_error = null;
  }
  if (nextStatus === "CLASSIFY_APPROVED") patch.copy_error = null;
  if (nextStatus === "COPY_COMPLETED") patch.classification_error = null;

  return saveProject(db, existing, {
    ...patch,
    project_name: input.folderName,
    source_relative_path: sourceRelativePath,
    status: "MERGE_APPROVED",
    merge_approved_at: now,
    discovered_at: now,
    raw_count: input.rawCount ?? 0,
    jpg_count: input.jpgCount ?? 0,
    jpg_bytes: input.jpgBytes ?? 0,
  }, patch);
}
