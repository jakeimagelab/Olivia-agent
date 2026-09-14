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
    const { data: updated, error } = await db
      .from("photo_storage_projects")
      .update({ status: "APPROVED", copy_error: null, copy_progress: {}, copy_started_at: null, copy_completed_at: null, copy_job_id: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["COPY_FAILED"])
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      const { data: current, error: readError } = await db.from("photo_storage_projects").select("*").eq("id", id).maybeSingle();
      if (readError) throw readError;
      if (!current) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
      if (current.status !== "APPROVED") return Response.json({ ok: false, error: "복사 실패 상태에서만 다시 시도할 수 있습니다.", project: current }, { status: 409 });
      return Response.json({ ok: true, project: current, idempotent: true });
    }
    await acknowledgePhotoStorageEvents(db, id);
    await ensurePhotoStorageEvent(db, { projectId: id, projectName: updated.project_name, status: "APPROVED" });
    return Response.json({ ok: true, project: updated, idempotent: false });
  } catch (error) {
    console.error("[photo-storage retry]", error);
    return Response.json({ ok: false, error: "복사를 다시 요청하지 못했습니다." }, { status: 500 });
  }
}

