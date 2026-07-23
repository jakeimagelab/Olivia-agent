import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canEditTask, canViewProject, canViewTask } from "@/lib/teamWorkspace/permissions";
import { recalculateProjectProgress } from "@/lib/teamWorkspace/projectProgress";
import {
  apiError,
  apiOk,
  getTeamWorkspaceContext,
  loadProjectPermission,
  loadTaskPermission,
  memberExists,
  roomIsAccessible,
  sourceMessageBelongsToRoom,
} from "@/lib/teamWorkspace/server";
import { recordTaskEvent } from "@/lib/teamWorkspace/taskEvents";
import { isUuid, validateTaskInput } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ taskId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { taskId } = await params;
  if (!isUuid(taskId)) return apiError("업무 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadTaskPermission(taskId, context.actor.id);
  if (!access) return apiError("업무를 찾을 수 없습니다.", 404);
  if (!canViewTask(context.actor, access.permission)) return apiError("접근 권한이 없습니다.", 403);
  const db = getSupabaseAdmin();
  const [{ data: checklists }, { data: attachments }, { data: events }, { data: sourceMessage }] = await Promise.all([
    db.from("team_task_checklists").select("*").eq("task_id", taskId).order("sort_order"),
    db.from("team_task_attachments").select("*").eq("task_id", taskId).order("created_at"),
    db.from("team_task_events").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    access.row.source_message_id
      ? db.from("chat_messages").select("id,room_id,body,sender_type,sender_member_id,created_at").eq("id", access.row.source_message_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const memberIds = Array.from(new Set([
    access.row.assignee_id,
    access.row.created_by,
    access.row.approved_by,
    ...(events ?? []).map((event) => event.actor_id),
  ].filter(Boolean)));
  const [{ data: members }, project] = await Promise.all([
    memberIds.length
      ? db.from("chat_members").select("id,email,display_name,avatar_url").in("id", memberIds)
      : Promise.resolve({ data: [] }),
    access.row.project_id ? loadProjectPermission(access.row.project_id) : Promise.resolve(null),
  ]);
  const memberById = new Map((members ?? []).map((member) => [member.id, member]));
  return apiOk({
    task: {
      ...access.row,
      assignee: access.row.assignee_id ? memberById.get(access.row.assignee_id) ?? null : null,
      creator: memberById.get(access.row.created_by) ?? null,
      approver: access.row.approved_by ? memberById.get(access.row.approved_by) ?? null : null,
      project: project?.row ?? null,
      checklists: checklists ?? [],
      attachments: attachments ?? [],
      events: (events ?? []).map((event) => ({ ...event, actor: event.actor_id ? memberById.get(event.actor_id) ?? null : null })),
      sourceMessage,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { taskId } = await params;
  if (!isUuid(taskId)) return apiError("업무 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadTaskPermission(taskId, context.actor.id);
  if (!access) return apiError("업무를 찾을 수 없습니다.", 404);
  if (!canEditTask(context.actor, access.permission)) return apiError("수정 권한이 없습니다.", 403);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.status !== undefined && body.status !== access.row.status) {
    return apiError("업무 상태는 상태 변경 버튼을 사용해주세요.");
  }
  const input = validateTaskInput({
    title: body?.title ?? access.row.title,
    description: body?.description ?? access.row.description,
    assigneeId: body?.assigneeId ?? body?.assignee_id ?? access.row.assignee_id,
    projectId: body?.projectId ?? body?.project_id ?? access.row.project_id,
    roomId: body?.roomId ?? body?.room_id ?? access.row.room_id,
    sourceMessageId: body?.sourceMessageId ?? body?.source_message_id ?? access.row.source_message_id,
    priority: body?.priority ?? access.row.priority,
    status: access.row.status,
    startDate: body?.startDate ?? body?.start_date ?? access.row.start_date,
    dueDate: body?.dueDate ?? body?.due_date ?? access.row.due_date,
    checklist: body?.checklist ?? [],
  });
  if (!input.ok) return apiError(input.error);
  const value = input.value;
  if (value.assigneeId && !(await memberExists(value.assigneeId))) return apiError("담당자를 찾을 수 없습니다.");
  if (value.projectId) {
    const project = await loadProjectPermission(value.projectId);
    if (!project || !canViewProject(context.actor, project.permission)) return apiError("프로젝트 접근 권한이 없습니다.", 403);
  }
  if (value.roomId && !(await roomIsAccessible(value.roomId, context.actor.id)) && !context.actor.isAdmin) {
    return apiError("채팅방 접근 권한이 없습니다.", 403);
  }
  if (value.sourceMessageId) {
    if (!value.roomId || !(await sourceMessageBelongsToRoom(value.sourceMessageId, value.roomId))) {
      return apiError("원본 메시지가 해당 채팅방에 속하지 않습니다.");
    }
  }

  const now = new Date().toISOString();
  const db = getSupabaseAdmin();
  const { data: task, error } = await db.from("team_tasks").update({
    title: value.title,
    description: value.description,
    assignee_id: value.assigneeId,
    project_id: value.projectId,
    room_id: value.roomId,
    source_message_id: value.sourceMessageId,
    priority: value.priority,
    start_date: value.startDate,
    due_date: value.dueDate,
    updated_at: now,
  }).eq("id", taskId).select("*").single();
  if (error) return apiError(error.message, 500);

  const events: Promise<void>[] = [];
  if (access.row.assignee_id !== value.assigneeId) {
    events.push(recordTaskEvent({
      taskId,
      actorId: context.actor.id,
      eventType: "assigned",
      fromValue: access.row.assignee_id,
      toValue: value.assigneeId,
    }));
  }
  if (access.row.due_date !== value.dueDate) {
    events.push(recordTaskEvent({
      taskId,
      actorId: context.actor.id,
      eventType: "due_date_changed",
      fromValue: access.row.due_date,
      toValue: value.dueDate,
    }));
  }
  if (Array.isArray(body?.checklist)) {
    await db.from("team_task_checklists").delete().eq("task_id", taskId);
    if (value.checklist.length) {
      await db.from("team_task_checklists").insert(
        value.checklist.map((content, sortOrder) => ({ task_id: taskId, content, sort_order: sortOrder }))
      );
    }
  }
  await Promise.all([
    ...events,
    recalculateProjectProgress(access.row.project_id),
    value.projectId !== access.row.project_id ? recalculateProjectProgress(value.projectId) : Promise.resolve(0),
  ]);
  return apiOk({ task });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { taskId } = await params;
  if (!isUuid(taskId)) return apiError("업무 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadTaskPermission(taskId, context.actor.id);
  if (!access) return apiError("업무를 찾을 수 없습니다.", 404);
  if (!canEditTask(context.actor, access.permission)) return apiError("삭제 권한이 없습니다.", 403);
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin().from("team_tasks").update({
    status: "canceled",
    updated_at: now,
  }).eq("id", taskId).eq("status", access.row.status);
  if (error) return apiError(error.message, 500);
  await Promise.all([
    recordTaskEvent({
      taskId,
      actorId: context.actor.id,
      eventType: "status_changed",
      fromValue: access.row.status,
      toValue: "canceled",
    }),
    recalculateProjectProgress(access.row.project_id),
  ]);
  return apiOk({});
}
