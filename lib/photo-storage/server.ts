import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type PhotoProjectEventType,
  type PhotoProjectStatus,
  type PhotoStorageEvent,
} from "./types";

export { PHOTO_EVENT_TYPES, PHOTO_PROJECT_STATUSES } from "./types";
export type { PhotoProjectEventType, PhotoProjectStatus, PhotoStorageEvent, PhotoStorageProject } from "./types";

export function isInternalPhotoStorageRequest(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY?.trim();
  return Boolean(expected && request.headers.get("x-internal-key") === expected);
}

/** 서버에는 NAS mount path가 아니라 Worker가 제공한 raw relative path만 저장한다. */
export function validatePhotoProjectRelativePath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("source_relative_path가 필요합니다.");
  const raw = value;
  if (raw.includes("\0") || raw.includes("\\") || raw.startsWith("/") || path.isAbsolute(raw)) {
    throw new Error("source_relative_path는 NAS Root 기준 상대경로여야 합니다.");
  }
  const segments = raw.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("source_relative_path에 허용되지 않는 경로가 있습니다.");
  }
  return raw;
}

export function parseNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field}는 0 이상의 정수여야 합니다.`);
  }
  return value;
}

export function parseOptionalIsoDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) throw new Error(`${field} 형식이 올바르지 않습니다.`);
  return value;
}

export function isMissingPhotoNotificationColumns(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(record.message || "")} ${String(record.details || "")}`;
  return (record.code === "42703" || record.code === "PGRST204")
    && (text.includes("notification_deferred_until") || text.includes("notification_dismissed_at"));
}

/**
 * 상태 전이가 먼저 성공한 뒤 호출되므로, 알림 컬럼 정리 실패가 동일 작업을 재실행하게 만들면 안 된다.
 * 아직 migration이 적용되지 않은 배포에서는 기존 파이프라인을 보존하고, 그 외 오류만 기록한다.
 */
export async function clearPhotoProjectNotificationState(db: SupabaseClient, projectId: string): Promise<void> {
  const { error } = await db
    .from("photo_storage_projects")
    .update({ notification_deferred_until: null, notification_dismissed_at: null })
    .eq("id", projectId);
  if (!error) return;
  if (isMissingPhotoNotificationColumns(error)) return;
  console.error("[photo-storage notification state clear]", error);
}

export function eventForStatus(status: PhotoProjectStatus): { type: PhotoProjectEventType; message: string; requiresAction: boolean } {
  if (status === "READY") return { type: "PHOTO_PROJECT_READY", message: "촬영 파일이 확인되었습니다.", requiresAction: true };
  if (status === "REVIEW_REQUIRED") return { type: "PHOTO_PROJECT_REVIEW_REQUIRED", message: "촬영 파일을 확인해야 합니다.", requiresAction: true };
  if (status === "ERROR") return { type: "PHOTO_PROJECT_ERROR", message: "촬영 프로젝트 처리 중 오류가 발생했습니다.", requiresAction: true };
  if (status === "MERGE_APPROVED") return { type: "PHOTO_PROJECT_APPROVED", message: "JPG 통합이 승인되었습니다.", requiresAction: false };
  if (status === "MERGING") return { type: "PHOTO_MERGE_STARTED", message: "SSD1에서 JPG를 통합하고 있습니다.", requiresAction: false };
  if (status === "MERGE_COMPLETED") return { type: "PHOTO_MERGE_COMPLETED", message: "원본 통합이 완료되었습니다. 사진 분류를 시작할까요?", requiresAction: true };
  if (status === "MERGE_FAILED") return { type: "PHOTO_MERGE_FAILED", message: "JPG 통합 중 문제가 발생했습니다. 원본은 그대로입니다.", requiresAction: true };
  if (status === "CLASSIFY_APPROVED") return { type: "PHOTO_PROJECT_CLASSIFY_APPROVED", message: "사진 분류가 승인되었습니다. 작업 대기 상태입니다.", requiresAction: false };
  if (status === "COPY_QUEUED" || status === "COPYING" || status === "COPY_VERIFYING") return { type: "PHOTO_COPY_STARTED", message: "JPG 원본 복사를 시작했습니다.", requiresAction: false };
  if (status === "COPY_COMPLETED") return { type: "PHOTO_COPY_COMPLETED", message: "JPG 복사가 완료되었습니다.", requiresAction: false };
  if (status === "COPY_FAILED") return { type: "PHOTO_COPY_FAILED", message: "JPG 복사 중 문제가 발생했습니다. 원본은 변경되지 않았습니다.", requiresAction: true };
  if (status === "CLASSIFY_QUEUED" || status === "CLASSIFYING" || status === "CLASSIFY_VERIFYING") return { type: "PHOTO_CLASSIFICATION_STARTED", message: "사진 자동 분류를 시작했습니다.", requiresAction: false };
  if (status === "CLASSIFY_COMPLETED") return { type: "PHOTO_CLASSIFICATION_COMPLETED", message: "사진 자동 분류가 완료되었습니다.", requiresAction: false };
  if (status === "CLASSIFY_FAILED") return { type: "PHOTO_CLASSIFICATION_FAILED", message: "사진 분류 중 문제가 발생했습니다. 확인이 필요합니다.", requiresAction: true };
  return { type: "PHOTO_PROJECT_DEFERRED", message: "촬영 프로젝트를 나중에 처리하도록 보류했습니다.", requiresAction: false };
}

export async function ensurePhotoStorageEvent(
  db: SupabaseClient,
  input: { projectId: string; projectName: string; status: PhotoProjectStatus; payload?: Record<string, unknown> },
): Promise<{ event: PhotoStorageEvent | null; created: boolean }> {
  const event = eventForStatus(input.status);
  const detail = typeof input.payload?.message === "string" && input.payload.message.trim()
    ? input.payload.message.trim().slice(0, 400)
    : event.message;
  const message = `${input.projectName} ${detail}`;
  const { data: existing, error: existingError } = await db
    .from("photo_storage_events")
    .select("*")
    .eq("project_id", input.projectId)
    .eq("event_type", event.type)
    .eq("status", "OPEN")
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { event: existing as PhotoStorageEvent, created: false };

  const { data, error } = await db
    .from("photo_storage_events")
    .insert({
      project_id: input.projectId,
      event_type: event.type,
      status: "OPEN",
      message,
      requires_action: event.requiresAction,
      payload: input.payload ?? {},
    })
    .select("*")
    .single();
  // Two watcher retries can race. The partial unique index makes the second insert
  // harmless; read back the already-created event instead of surfacing a duplicate error.
  if (error?.code === "23505") {
    const { data: raced } = await db
      .from("photo_storage_events")
      .select("*")
      .eq("project_id", input.projectId)
      .eq("event_type", event.type)
      .eq("status", "OPEN")
      .maybeSingle();
    return { event: (raced as PhotoStorageEvent | null) ?? null, created: false };
  }
  if (error) throw error;
  return { event: data as PhotoStorageEvent, created: true };
}

export async function acknowledgePhotoStorageEvents(db: SupabaseClient, projectId: string, except?: PhotoProjectEventType): Promise<void> {
  let query = db
    .from("photo_storage_events")
    .update({ status: "ACKNOWLEDGED", acknowledged_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("status", "OPEN");
  if (except) query = query.neq("event_type", except);
  const { error } = await query;
  if (error) throw error;
}
