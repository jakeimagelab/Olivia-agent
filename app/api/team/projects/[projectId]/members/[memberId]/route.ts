import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canEditProject } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, loadProjectPermission } from "@/lib/teamWorkspace/server";
import { isUuid } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  const { projectId, memberId } = await params;
  if (!isUuid(projectId) || !isUuid(memberId)) return apiError("ID 값이 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadProjectPermission(projectId);
  if (!access) return apiError("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(context.actor, access.permission)) return apiError("멤버 관리 권한이 없습니다.", 403);
  if (access.row.owner_id === memberId) return apiError("프로젝트 책임자는 먼저 다른 사람으로 변경해주세요.");
  const { error } = await getSupabaseAdmin()
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("member_id", memberId);
  if (error) return apiError(error.message, 500);
  return apiOk({});
}
