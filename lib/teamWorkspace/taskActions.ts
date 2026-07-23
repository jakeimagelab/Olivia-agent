import { getSupabaseAdmin } from "@/lib/supabase";
import { canApproveTask, canEditTask, canRequestRevision, canSubmitTask } from "./permissions";
import { recalculateProjectProgress } from "./projectProgress";
import { loadTaskPermission, type TeamWorkspaceContext } from "./server";
import { recordTaskEvent, type TaskEventType } from "./taskEvents";
import { postTaskEventToRoom } from "./taskNotifications";

type TaskAction = "start" | "submit" | "approve" | "request_revision" | "hold" | "reopen";

const RULES: Record<TaskAction, { from: string[]; to: string; event: TaskEventType }> = {
  start: { from: ["todo"], to: "in_progress", event: "status_changed" },
  submit: { from: ["in_progress"], to: "review", event: "submitted" },
  approve: { from: ["review"], to: "completed", event: "approved" },
  request_revision: { from: ["review"], to: "in_progress", event: "revision_requested" },
  hold: { from: ["todo", "in_progress"], to: "on_hold", event: "status_changed" },
  reopen: { from: ["completed", "on_hold"], to: "in_progress", event: "status_changed" },
};

export async function performTaskAction(input: {
  context: TeamWorkspaceContext;
  taskId: string;
  action: TaskAction;
  note?: string | null;
}): Promise<{ ok: true; task: Record<string, any> } | { ok: false; error: string; status: number }> {
  const access = await loadTaskPermission(input.taskId, input.context.actor.id);
  if (!access) return { ok: false, error: "업무를 찾을 수 없습니다.", status: 404 };
  const rule = RULES[input.action];
  if (!rule.from.includes(access.row.status)) {
    return { ok: false, error: "현재 상태에서는 이 작업을 수행할 수 없습니다.", status: 409 };
  }
  const permission = access.permission;
  const allowed = input.action === "submit"
    ? canSubmitTask(input.context.actor, permission)
    : input.action === "approve"
      ? canApproveTask(input.context.actor, permission)
      : input.action === "request_revision"
        ? canRequestRevision(input.context.actor, permission)
        : canEditTask(input.context.actor, permission);
  if (!allowed) return { ok: false, error: "이 작업을 수행할 권한이 없습니다.", status: 403 };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: rule.to, updated_at: now };
  if (input.action === "start") patch.start_date = access.row.start_date ?? now.slice(0, 10);
  if (input.action === "submit") patch.submitted_at = now;
  if (input.action === "approve") {
    patch.approved_by = input.context.actor.id;
    patch.approved_at = now;
    patch.completed_at = now;
    patch.revision_note = null;
  }
  if (input.action === "request_revision") {
    patch.revision_note = input.note;
    patch.approved_by = null;
    patch.approved_at = null;
    patch.completed_at = null;
  }
  if (input.action === "reopen") {
    patch.approved_by = null;
    patch.approved_at = null;
    patch.completed_at = null;
  }

  const db = getSupabaseAdmin();
  const { data: task, error } = await db
    .from("team_tasks")
    .update(patch)
    .eq("id", input.taskId)
    .eq("status", access.row.status)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!task) return { ok: false, error: "다른 사용자가 먼저 상태를 변경했습니다. 새로고침 후 다시 시도해주세요.", status: 409 };

  await Promise.all([
    recordTaskEvent({
      taskId: task.id,
      actorId: input.context.actor.id,
      eventType: rule.event,
      fromValue: access.row.status,
      toValue: rule.to,
      note: input.note ?? null,
    }),
    postTaskEventToRoom({
      roomId: task.room_id,
      taskId: task.id,
      taskTitle: task.title,
      actorId: input.context.actor.id,
      eventType: rule.event,
      note: input.note ?? null,
    }),
    recalculateProjectProgress(task.project_id),
  ]);
  return { ok: true, task };
}
