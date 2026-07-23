import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canEditTask } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, loadTaskPermission } from "@/lib/teamWorkspace/server";
import { isUuid } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string; checklistId: string }> }
) {
  const { taskId, checklistId } = await params;
  if (!isUuid(taskId) || !isUuid(checklistId)) return apiError("ID 값이 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadTaskPermission(taskId, context.actor.id);
  if (!access || !canEditTask(context.actor, access.permission)) return apiError("수정 권한이 없습니다.", 403);
  const body = await req.json().catch(() => null);
  if (typeof body?.completed !== "boolean") return apiError("완료 여부가 올바르지 않습니다.");
  const { data: checklist, error } = await getSupabaseAdmin()
    .from("team_task_checklists")
    .update({ completed: body.completed, updated_at: new Date().toISOString() })
    .eq("id", checklistId)
    .eq("task_id", taskId)
    .select("*")
    .maybeSingle();
  if (error) return apiError(error.message, 500);
  if (!checklist) return apiError("체크리스트를 찾을 수 없습니다.", 404);
  return apiOk({ checklist });
}
