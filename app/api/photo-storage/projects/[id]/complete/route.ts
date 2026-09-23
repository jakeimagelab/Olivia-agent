import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { isPhotoProjectActionable } from "@/lib/photo-storage/notificationPolicy";
import { acknowledgePhotoStorageEvents } from "@/lib/photo-storage/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return Response.json({ ok: false, error: "올바르지 않은 프로젝트 ID입니다." }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const { data: current, error: readError } = await db
      .from("photo_storage_projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    if (!isPhotoProjectActionable(current)) {
      return Response.json({ ok: false, error: "진행 중인 프로젝트는 완료 처리할 수 없습니다.", project: current }, { status: 409 });
    }

    const completedAt = new Date().toISOString();
    const { data: project, error } = await db
      .from("photo_storage_projects")
      .update({
        notification_dismissed_at: completedAt,
        notification_deferred_until: null,
        updated_at: completedAt,
      })
      .eq("id", id)
      .eq("status", current.status)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!project) return Response.json({ ok: false, error: "프로젝트 상태가 변경되었습니다." }, { status: 409 });

    await acknowledgePhotoStorageEvents(db, id);
    return Response.json({ ok: true, project, completedAt });
  } catch (error) {
    console.error("[photo-storage complete]", error);
    return Response.json({ ok: false, error: "프로젝트를 완료 처리하지 못했습니다." }, { status: 500 });
  }
}
