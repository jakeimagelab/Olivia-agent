import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePhotoProjectRelativePath } from "./server";
import type { PhotoStorageProject } from "./types";

// 코드 요청서(2026-09-18) 작업 D — NAS 백업 경로("[분류 시작]" 카드 버튼, nas_backup_start_sort
// 도구) 양쪽 진입점이 공유하는 단 하나의 함수. department/shooting_mode는 항상 호출자가 이미
// 확정한 값이어야 한다(추측 금지 규칙은 여기서 다시 검사하지 않는다 — 호출자가 이미 검사했다는
// 전제). 이 함수는 photo_storage_projects row를 MERGE_APPROVED로 밀어넣기만 하고, 그 이후의
// MERGE→COPY→CLASSIFY 진행은 기존 PHASE 6 claim RPC들(건드리지 않음)이 그대로 이어받는다.

const PIPELINE_RESTART_STATUSES = new Set([
  "READY", "DEFERRED", "REVIEW_REQUIRED", "ERROR",
  "MERGE_FAILED", "COPY_FAILED", "CLASSIFY_FAILED",
]);

export type StartNasBackupClassificationInput = {
  folderName: string;
  department: string;
  shootingMode: "field" | "studio";
  rawCount?: number;
  jpgCount?: number;
  jpgBytes?: number;
};

export async function startNasBackupClassification(
  db: SupabaseClient,
  input: StartNasBackupClassificationInput,
): Promise<PhotoStorageProject> {
  const sourceRelativePath = validatePhotoProjectRelativePath(input.folderName);
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await db
    .from("photo_storage_projects")
    .select("*")
    .eq("source_relative_path", sourceRelativePath)
    .maybeSingle();
  if (existingError) throw existingError;

  // 이미 MERGE_APPROVED보다 앞선 단계(또는 실패)면 처음부터 다시 시작한다 — "분류 시작"을 다시
  // 누른다는 것 자체가 재시도 의사표시다. 이미 진행 중/완료된 단계는 되돌리지 않는다(중복 실행
  // 방지, PHASE 6 안전장치와 동일한 전제).
  const shouldRestart = !existing || PIPELINE_RESTART_STATUSES.has(existing.status as string);
  const patch: Record<string, unknown> = {
    nas_department: input.department,
    nas_shooting_mode: input.shootingMode,
    updated_at: now,
  };
  if (shouldRestart) {
    patch.status = "MERGE_APPROVED";
    patch.merge_approved_at = now;
  }

  const query = existing
    ? db.from("photo_storage_projects").update(patch).eq("id", existing.id)
    : db.from("photo_storage_projects").insert({
        ...patch,
        project_name: input.folderName,
        source_relative_path: sourceRelativePath,
        status: "MERGE_APPROVED",
        merge_approved_at: now,
        discovered_at: now,
        raw_count: input.rawCount ?? 0,
        jpg_count: input.jpgCount ?? 0,
        jpg_bytes: input.jpgBytes ?? 0,
      });
  const { data: project, error: saveError } = await query.select("*").single();
  if (saveError || !project) throw saveError ?? new Error("NAS 백업 프로젝트 저장에 실패했습니다.");
  return project as PhotoStorageProject;
}
