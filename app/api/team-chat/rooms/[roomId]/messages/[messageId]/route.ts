import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canViewProject } from "@/lib/teamWorkspace/permissions";
import { getTeamWorkspaceContext, loadProjectPermission, roomIsAccessible } from "@/lib/teamWorkspace/server";
import { isUuid } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const { roomId, messageId } = await params;
  if (!isUuid(roomId) || !isUuid(messageId)) return NextResponse.json({ ok: false, error: "ID 값이 올바르지 않습니다." }, { status: 400 });
  const context = await getTeamWorkspaceContext(req);
  if (!context) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  if (!(await roomIsAccessible(roomId, context.actor.id)) && !context.actor.isAdmin) {
    return NextResponse.json({ ok: false, error: "채팅방 접근 권한이 없습니다." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const projectId = body?.projectId;
  if (!isUuid(projectId)) return NextResponse.json({ ok: false, error: "프로젝트 ID가 올바르지 않습니다." }, { status: 400 });
  const project = await loadProjectPermission(projectId);
  if (!project || !canViewProject(context.actor, project.permission)) {
    return NextResponse.json({ ok: false, error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });
  }
  const db = getSupabaseAdmin();
  const { data: message } = await db.from("chat_messages").select("metadata").eq("id", messageId).eq("room_id", roomId).maybeSingle();
  if (!message) return NextResponse.json({ ok: false, error: "메시지를 찾을 수 없습니다." }, { status: 404 });
  const metadata = { ...(message.metadata ?? {}), projectId };
  const { error } = await db.from("chat_messages").update({ metadata }).eq("id", messageId).eq("room_id", roomId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, project: project.row });
}
