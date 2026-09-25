/*
 * 사진 상태 머신(photo_storage_projects.status)과 워크플로 12단계(workflow_runs.current_step_key)는
 * 별개다 — 절대 하나로 합치지 않는다. 사진 파이프라인은 잔금·계산서(payment_confirm) 확인 여부와
 * 무관하게 계속 돌아간다. 아래 표에 없는 조합으로 이 파일이 워크플로 단계를 바꾸지 않는다.
 *
 * | 사진 머신 상태 변화                          | 워크플로 단계 영향                                    |
 * |-----------------------------------------------|--------------------------------------------------------|
 * | NAS 폴더 감지 → READY                          | shooting → payment_confirm                             |
 * | 1차 승인 (MERGE_APPROVED)                      | 없음                                                     |
 * | 2차 승인 (CLASSIFY_APPROVED)                   | 없음                                                     |
 * | 분류 완료                                       | backup_sorting → client_selection (단, payment_confirm이면 대기) |
 * | 셀렉 갤러리 생성                                 | backup_sorting → client_selection                       |
 * | 고객 셀렉 제출                                   | client_selection → raw_matching                         |
 * | RAW 매칭 완료                                    | → retouching                                            |
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEventDeduplicationKey, emitOliviaEvent } from "@/lib/olivia/events";
import {
  acknowledgePhotoStorageEvents,
  clearPhotoProjectNotificationState,
  ensurePhotoStorageEvent,
} from "@/lib/photo-storage/server";
import { syncClassificationCompletedWorkflow } from "@/lib/photo-storage/shootingProgress";
import { registerOriginalDeliveryLink } from "@/lib/photo-storage/shootingProgressActions";
import type { PhotoProjectStatus } from "@/lib/photo-storage/types";
import { coreCommandFailure, type CoreCommandResult } from "./result";

type PhotoProjectRow = Record<string, unknown> & {
  id: string;
  status: PhotoProjectStatus;
  project_name: string;
  workflow_run_id?: string | null;
  project_id?: string | null;
  nas_department?: string | null;
  nas_shooting_mode?: string | null;
};

async function loadPhotoProject(db: SupabaseClient, projectId: string): Promise<PhotoProjectRow> {
  const { data, error } = await db.from("photo_storage_projects").select("*").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("프로젝트를 찾을 수 없습니다.");
  return data as PhotoProjectRow;
}

async function finishApprovalSideEffects(
  db: SupabaseClient,
  project: PhotoProjectRow,
  eventType: "PHOTO_PROJECT_APPROVED" | "PHOTO_PROJECT_CLASSIFY_APPROVED",
) {
  await clearPhotoProjectNotificationState(db, project.id);
  await acknowledgePhotoStorageEvents(db, project.id, eventType);
  await ensurePhotoStorageEvent(db, {
    projectId: project.id,
    projectName: project.project_name,
    status: project.status,
  });
}

export async function approveSourceSeparation(
  db: SupabaseClient,
  projectId: string,
  current?: PhotoProjectRow,
): Promise<CoreCommandResult<{ project: PhotoProjectRow }>> {
  try {
    const project = current ?? await loadPhotoProject(db, projectId);
    if (project.status === "MERGE_APPROVED") {
      await clearPhotoProjectNotificationState(db, projectId);
      return { ok: true, value: { project }, idempotent: true };
    }
    if (!['READY', 'DEFERRED'].includes(project.status)) {
      return { ok: false, reason: "READY 또는 DEFERRED 상태에서만 원본 분리를 승인할 수 있습니다.", code: "INVALID_STATE" };
    }
    const now = new Date().toISOString();
    const { data, error } = await db.from("photo_storage_projects")
      .update({ status: "MERGE_APPROVED", merge_approved_at: now, updated_at: now })
      .eq("id", projectId)
      .eq("status", project.status)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, reason: "프로젝트 상태가 변경되었습니다.", code: "STATE_CHANGED" };
    const updated = data as PhotoProjectRow;
    await finishApprovalSideEffects(db, updated, "PHOTO_PROJECT_APPROVED");
    return { ok: true, value: { project: updated }, idempotent: false };
  } catch (error) {
    return coreCommandFailure(error, "원본 분리 승인을 처리하지 못했습니다.");
  }
}

export async function approveClassification(
  db: SupabaseClient,
  projectId: string,
  current?: PhotoProjectRow,
): Promise<CoreCommandResult<{ project: PhotoProjectRow }>> {
  try {
    const project = current ?? await loadPhotoProject(db, projectId);
    if (project.status === "CLASSIFY_APPROVED") {
      await clearPhotoProjectNotificationState(db, projectId);
      return { ok: true, value: { project }, idempotent: true };
    }
    if (project.status !== "MERGE_COMPLETED") {
      return { ok: false, reason: "MERGE_COMPLETED 상태에서만 사진 분류를 승인할 수 있습니다.", code: "INVALID_STATE" };
    }
    if (!project.nas_department || !project.nas_shooting_mode) {
      return {
        ok: false,
        reason: "진료과와 촬영모드가 모두 설정된 프로젝트만 사진 분류를 승인할 수 있습니다.",
        code: "CLASSIFICATION_CONTEXT_REQUIRED",
      };
    }
    const now = new Date().toISOString();
    const { data, error } = await db.from("photo_storage_projects")
      .update({
        status: "CLASSIFY_APPROVED",
        classify_approved_at: now,
        approved_at: now,
        approved_by: "admin",
        updated_at: now,
      })
      .eq("id", projectId)
      .eq("status", "MERGE_COMPLETED")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, reason: "프로젝트 상태가 변경되었습니다.", code: "STATE_CHANGED" };
    const updated = data as PhotoProjectRow;
    await finishApprovalSideEffects(db, updated, "PHOTO_PROJECT_CLASSIFY_APPROVED");
    return { ok: true, value: { project: updated }, idempotent: false };
  } catch (error) {
    return coreCommandFailure(error, "사진 분류 승인을 처리하지 못했습니다.");
  }
}

export async function approvePhotoProject(
  db: SupabaseClient,
  projectId: string,
): Promise<CoreCommandResult<{ project: PhotoProjectRow }>> {
  try {
    const project = await loadPhotoProject(db, projectId);
    if (["READY", "DEFERRED", "MERGE_APPROVED"].includes(project.status)) {
      return approveSourceSeparation(db, projectId, project);
    }
    if (["MERGE_COMPLETED", "CLASSIFY_APPROVED"].includes(project.status)) {
      return approveClassification(db, projectId, project);
    }
    return { ok: false, reason: "READY/DEFERRED 또는 MERGE_COMPLETED 상태에서만 승인할 수 있습니다.", code: "INVALID_STATE" };
  } catch (error) {
    return coreCommandFailure(error, "프로젝트 승인에 실패했습니다.");
  }
}

export async function completeSceneSort(
  db: SupabaseClient,
  projectId: string,
): Promise<CoreCommandResult<{ projectId: string; workflowRunId: string | null }>> {
  try {
    const project = await loadPhotoProject(db, projectId);
    await syncClassificationCompletedWorkflow(db, projectId);
    return {
      ok: true,
      value: { projectId, workflowRunId: project.workflow_run_id ?? null },
    };
  } catch (error) {
    return coreCommandFailure(error, "씬 분류 완료 상태를 워크플로우에 반영하지 못했습니다.");
  }
}

export async function registerGalleryLink(
  db: SupabaseClient,
  input: { projectId: string; url: unknown; clientId?: string | null; baseUrl: string },
): Promise<CoreCommandResult<Awaited<ReturnType<typeof registerOriginalDeliveryLink>>>> {
  try {
    const project = await loadPhotoProject(db, input.projectId);
    const value = await registerOriginalDeliveryLink(db, {
      projectId: input.projectId,
      nasLink: input.url,
      clientId: input.clientId,
      baseUrl: input.baseUrl,
    });
    await emitOliviaEvent(db, {
      eventType: "gallery_ready",
      eventSource: "photo_command",
      clientId: value.clientId,
      projectId: project.project_id ?? null,
      workflowRunId: project.workflow_run_id ?? null,
      payload: { photoProjectId: project.id, galleryId: value.galleryId },
      deduplicationKey: createEventDeduplicationKey("gallery_ready", project.id, value.galleryId),
    });
    return { ok: true, value };
  } catch (error) {
    return coreCommandFailure(error, "유그린 링크를 등록하지 못했습니다.");
  }
}
