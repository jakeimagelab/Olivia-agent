import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { acknowledgePhotoStorageEvents, clearPhotoProjectNotificationState, ensurePhotoStorageEvent, isInternalPhotoStorageRequest } from "@/lib/photo-storage/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  // 재시도는 헤르메스(Olivia MCP)의 retry_photo_storage_project 도구도 내부 호출한다.
  // 승인(READY/MERGE_COMPLETED 전이)은 이 경로로 들어오지 않으므로 계속 admin 세션만 요구한다.
  if (!isAdminSession(request) && !isInternalPhotoStorageRequest(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return Response.json({ ok: false, error: "올바르지 않은 프로젝트 ID입니다." }, { status: 400 });
  try {
    const db = getSupabaseAdmin();
    const { data: current, error: readError } = await db.from("photo_storage_projects").select("*").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!current) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    // REVIEW_REQUIRED는 merge/copy/classify 중 어느 단계에서 멈췄는지를 해당 단계의
    // error 컬럼으로 판별한다(그 단계에서만 채워지고, 이후 단계로 넘어갈 때 초기화된다).
    const reviewStageTarget = current.status === "REVIEW_REQUIRED"
      ? (current.merge_error ? "MERGE_APPROVED" : current.copy_error ? "CLASSIFY_APPROVED" : current.classification_error ? "COPY_COMPLETED" : null)
      : null;
    const targetStatus = current.status === "CLASSIFY_FAILED" ? "COPY_COMPLETED"
      : current.status === "COPY_FAILED" ? "CLASSIFY_APPROVED"
      : current.status === "MERGE_FAILED" ? "MERGE_APPROVED"
      : reviewStageTarget;
    if (!targetStatus) {
      if (current.status === "CLASSIFY_APPROVED" || current.status === "MERGE_APPROVED") return Response.json({ ok: true, project: current, idempotent: true });
      return Response.json({ ok: false, error: "통합·복사·분류 실패 상태에서만 다시 시도할 수 있습니다.", project: current }, { status: 409 });
    }
    const { data: updated, error } = await db
      .from("photo_storage_projects")
      .update({
        status: targetStatus,
        ...(targetStatus === "CLASSIFY_APPROVED" ? { copy_error: null, copy_progress: {}, copy_started_at: null, copy_completed_at: null, copy_job_id: null } : {}),
        ...(targetStatus === "MERGE_APPROVED" ? { merge_error: null, merge_progress: {}, merge_started_at: null, merge_completed_at: null, merge_job_id: null, merged_jpg_count: 0, merge_conflict_count: 0, raw_untouched_count: 0 } : {}),
        classification_error: null,
        classification_progress: {},
        classification_started_at: null,
        classification_completed_at: null,
        classify_job_id: null,
        scene_count: targetStatus === "CLASSIFY_APPROVED" ? 0 : current.scene_count,
        classified_jpg_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", current.status)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      const { data: latest, error: latestError } = await db.from("photo_storage_projects").select("*").eq("id", id).maybeSingle();
      if (latestError) throw latestError;
      if (!latest) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
      if (latest.status === targetStatus) {
        await clearPhotoProjectNotificationState(db, id);
        return Response.json({ ok: true, project: latest, idempotent: true });
      }
      return Response.json({ ok: false, error: "프로젝트 상태가 변경되었습니다.", project: latest }, { status: 409 });
    }
    await clearPhotoProjectNotificationState(db, id);
    await acknowledgePhotoStorageEvents(db, id);
    if (targetStatus === "CLASSIFY_APPROVED" || targetStatus === "MERGE_APPROVED") {
      await ensurePhotoStorageEvent(db, { projectId: id, projectName: updated.project_name, status: targetStatus });
    }
    return Response.json({ ok: true, project: updated, idempotent: false });
  } catch (error) {
    console.error("[photo-storage retry]", error);
    return Response.json({ ok: false, error: "작업을 다시 요청하지 못했습니다." }, { status: 500 });
  }
}
