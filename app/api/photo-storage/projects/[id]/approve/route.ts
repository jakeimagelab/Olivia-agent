import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { acknowledgePhotoStorageEvents, ensurePhotoStorageEvent } from "@/lib/photo-storage/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return Response.json({ ok: false, error: "올바르지 않은 프로젝트 ID입니다." }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const now = new Date().toISOString();

    // 1차 승인: READY/DEFERRED -> MERGE_APPROVED (SSD1 JPG 통합).
    const { data: mergeApproved, error: mergeError } = await db
      .from("photo_storage_projects")
      .update({ status: "MERGE_APPROVED", merge_approved_at: now, updated_at: now })
      .eq("id", id)
      .in("status", ["READY", "DEFERRED"])
      .select("*")
      .maybeSingle();
    if (mergeError) throw mergeError;

    // 2차 승인: MERGE_COMPLETED -> CLASSIFY_APPROVED (SSD1->SSD2 복사 + 분류).
    const { data: classifyApproved, error: classifyError } = mergeApproved
      ? { data: null, error: null }
      : await db
        .from("photo_storage_projects")
        .update({ status: "CLASSIFY_APPROVED", classify_approved_at: now, approved_at: now, approved_by: "admin", updated_at: now })
        .eq("id", id)
        .eq("status", "MERGE_COMPLETED")
        .select("*")
        .maybeSingle();
    if (classifyError) throw classifyError;

    let project = mergeApproved ?? classifyApproved;
    const updatedNow = Boolean(project);
    let nextStatus: "MERGE_APPROVED" | "CLASSIFY_APPROVED" | null = mergeApproved ? "MERGE_APPROVED" : classifyApproved ? "CLASSIFY_APPROVED" : null;

    if (!project) {
      const { data: current, error: readError } = await db.from("photo_storage_projects").select("*").eq("id", id).maybeSingle();
      if (readError) throw readError;
      if (!current) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
      if (current.status !== "MERGE_APPROVED" && current.status !== "CLASSIFY_APPROVED") {
        return Response.json({ ok: false, error: "READY/DEFERRED 또는 MERGE_COMPLETED 상태에서만 승인할 수 있습니다.", project: current }, { status: 409 });
      }
      project = current;
      nextStatus = current.status as "MERGE_APPROVED" | "CLASSIFY_APPROVED";
    }

    await acknowledgePhotoStorageEvents(db, id, nextStatus === "CLASSIFY_APPROVED" ? "PHOTO_PROJECT_CLASSIFY_APPROVED" : "PHOTO_PROJECT_APPROVED");
    await ensurePhotoStorageEvent(db, { projectId: id, projectName: project.project_name, status: nextStatus! });
    return Response.json({ ok: true, project, idempotent: !updatedNow });
  } catch (error) {
    console.error("[photo-storage approve]", error);
    return Response.json({ ok: false, error: "프로젝트 승인에 실패했습니다." }, { status: 500 });
  }
}
