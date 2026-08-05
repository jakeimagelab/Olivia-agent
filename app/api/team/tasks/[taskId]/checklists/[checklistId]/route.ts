import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canEditTask, canToggleChecklistItem } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, loadTaskPermission, memberExists } from "@/lib/teamWorkspace/server";
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
  if (!access) return apiError("업무를 찾을 수 없습니다.", 404);
  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("team_task_checklists").select("*").eq("id", checklistId).eq("task_id", taskId).maybeSingle();
  if (!existing) return apiError("체크리스트를 찾을 수 없습니다.", 404);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body?.completed !== undefined) {
    if (typeof body.completed !== "boolean") return apiError("완료 여부가 올바르지 않습니다.");
    if (!canToggleChecklistItem(context.actor, access.permission, existing.assignee_id)) {
      return apiError("체크할 권한이 없습니다.", 403);
    }
    patch.completed = body.completed;
  }
  if (body?.content !== undefined || body?.assigneeId !== undefined) {
    if (!canEditTask(context.actor, access.permission)) return apiError("수정 권한이 없습니다.", 403);
    if (body.content !== undefined) {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content || content.length > 500) return apiError("업무 내용은 1~500자로 입력해주세요.");
      patch.content = content;
    }
    if (body.assigneeId !== undefined) {
      const assigneeId = body.assigneeId === null || body.assigneeId === "" ? null : body.assigneeId;
      if (assigneeId !== null) {
        if (!isUuid(assigneeId as string)) return apiError("담당자가 올바르지 않습니다.");
        if (!(await memberExists(assigneeId as string))) return apiError("담당자를 찾을 수 없습니다.");
      }
      patch.assignee_id = assigneeId;
    }
  }
  if (Object.keys(patch).length === 1) return apiError("변경할 내용이 없습니다.");

  const { data: checklist, error } = await db
    .from("team_task_checklists")
    .update(patch)
    .eq("id", checklistId)
    .eq("task_id", taskId)
    .select("*")
    .maybeSingle();
  if (error) return apiError(error.message, 500);
  if (!checklist) return apiError("체크리스트를 찾을 수 없습니다.", 404);
  return apiOk({ checklist });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string; checklistId: string }> }
) {
  const { taskId, checklistId } = await params;
  if (!isUuid(taskId) || !isUuid(checklistId)) return apiError("ID 값이 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadTaskPermission(taskId, context.actor.id);
  if (!access || !canEditTask(context.actor, access.permission)) return apiError("삭제 권한이 없습니다.", 403);
  const { error } = await getSupabaseAdmin().from("team_task_checklists").delete().eq("id", checklistId).eq("task_id", taskId);
  if (error) return apiError(error.message, 500);
  return apiOk({});
}
