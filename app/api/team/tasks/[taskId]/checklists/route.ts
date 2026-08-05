import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canEditTask } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, loadTaskPermission, memberExists } from "@/lib/teamWorkspace/server";
import { isUuid } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!isUuid(taskId)) return apiError("업무 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadTaskPermission(taskId, context.actor.id);
  if (!access || !canEditTask(context.actor, access.permission)) return apiError("수정 권한이 없습니다.", 403);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content || content.length > 500) return apiError("업무 내용은 1~500자로 입력해주세요.");
  const assigneeId = typeof body?.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
  if (assigneeId) {
    if (!isUuid(assigneeId)) return apiError("담당자가 올바르지 않습니다.");
    if (!(await memberExists(assigneeId))) return apiError("담당자를 찾을 수 없습니다.");
  }

  const db = getSupabaseAdmin();
  const { data: last } = await db
    .from("team_task_checklists")
    .select("sort_order")
    .eq("task_id", taskId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? -1) + 1;

  const { data: checklist, error } = await db
    .from("team_task_checklists")
    .insert({ task_id: taskId, content, assignee_id: assigneeId, sort_order: sortOrder })
    .select("*")
    .single();
  if (error) return apiError(error.message, 500);
  return apiOk({ checklist });
}
