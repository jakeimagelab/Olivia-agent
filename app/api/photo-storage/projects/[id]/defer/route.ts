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
    const { data: updated, error } = await db
      .from("photo_storage_projects")
      .update({ status: "DEFERRED", updated_at: now })
      .eq("id", id)
      .eq("status", "READY")
      .select("*")
      .maybeSingle();
    if (error) throw error;

    let project = updated;
    if (!project) {
      const { data: current, error: readError } = await db.from("photo_storage_projects").select("*").eq("id", id).maybeSingle();
      if (readError) throw readError;
      if (!current) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
      if (current.status !== "DEFERRED") return Response.json({ ok: false, error: "READY 상태에서만 나중에 처리할 수 있습니다.", project: current }, { status: 409 });
      project = current;
    }

    await acknowledgePhotoStorageEvents(db, id, "PHOTO_PROJECT_DEFERRED");
    await ensurePhotoStorageEvent(db, { projectId: id, projectName: project.project_name, status: "DEFERRED" });
    return Response.json({ ok: true, project, idempotent: !updated });
  } catch (error) {
    console.error("[photo-storage defer]", error);
    return Response.json({ ok: false, error: "프로젝트를 보류하지 못했습니다." }, { status: 500 });
  }
}
