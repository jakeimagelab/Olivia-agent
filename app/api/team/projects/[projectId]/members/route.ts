import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canEditProject, canViewProject } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, loadProjectPermission, memberExists } from "@/lib/teamWorkspace/server";
import { isProjectMemberRole, isUuid } from "@/lib/teamWorkspace/validation";
import { grantRoomDriveAccessForRoom } from "@/lib/googleDrive/roomDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ projectId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!isUuid(projectId)) return apiError("프로젝트 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadProjectPermission(projectId);
  if (!access) return apiError("프로젝트를 찾을 수 없습니다.", 404);
  if (!canViewProject(context.actor, access.permission)) return apiError("접근 권한이 없습니다.", 403);
  const db = getSupabaseAdmin();
  const { data: roster, error } = await db.from("project_members").select("*").eq("project_id", projectId);
  if (error) return apiError(error.message, 500);
  const ids = (roster ?? []).map((row) => row.member_id);
  const { data: members } = ids.length
    ? await db.from("chat_members").select("id,email,display_name,avatar_url").in("id", ids)
    : { data: [] };
  const byId = new Map((members ?? []).map((member) => [member.id, member]));
  return apiOk({ members: (roster ?? []).map((row) => ({ ...row, member: byId.get(row.member_id) })) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!isUuid(projectId)) return apiError("프로젝트 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadProjectPermission(projectId);
  if (!access) return apiError("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(context.actor, access.permission)) return apiError("멤버 관리 권한이 없습니다.", 403);
  const body = await req.json().catch(() => null);
  const memberId = body?.memberId;
  const role = body?.role ?? "member";
  if (!isUuid(memberId) || !isProjectMemberRole(role)) return apiError("멤버 또는 역할 값이 올바르지 않습니다.");
  if (!(await memberExists(memberId))) return apiError("멤버를 찾을 수 없습니다.");
  const db = getSupabaseAdmin();
  const { error } = await db.from("project_members").upsert({
    project_id: projectId,
    member_id: memberId,
    role,
  }, { onConflict: "project_id,member_id" });
  if (error) return apiError(error.message, 500);
  const { data: room } = await db.from("chat_rooms").select("id").eq("project_id", projectId).maybeSingle();
  if (room) {
    await db.from("chat_room_members").upsert({ room_id: room.id, member_id: memberId }, { onConflict: "room_id,member_id" });
    grantRoomDriveAccessForRoom(room.id, memberId).catch((driveError) => {
      console.error("[team-workspace] Drive 접근권한 부여 실패:", driveError);
    });
  }
  return apiOk({});
}
