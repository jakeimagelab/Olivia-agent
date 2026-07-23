import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canViewProject, canViewTask } from "@/lib/teamWorkspace/permissions";
import { recalculateProjectProgress } from "@/lib/teamWorkspace/projectProgress";
import {
  apiError,
  apiOk,
  getTeamWorkspaceContext,
  loadProjectPermission,
  memberExists,
  roomIsAccessible,
  sourceMessageBelongsToRoom,
} from "@/lib/teamWorkspace/server";
import { recordTaskEvent } from "@/lib/teamWorkspace/taskEvents";
import { isUuid, validateTaskInput } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const params = new URL(req.url).searchParams;
  const db = getSupabaseAdmin();
  let query = db.from("team_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false });
  if (params.get("includeCanceled") !== "true") query = query.neq("status", "canceled");
  const status = params.get("status");
  const projectId = params.get("projectId");
  if (status) query = query.eq("status", status);
  if (projectId && isUuid(projectId)) query = query.eq("project_id", projectId);
  if (params.get("mine") === "true") query = query.eq("assignee_id", context.actor.id);
  if (params.get("overdue") === "true") {
    query = query.lt("due_date", new Date().toISOString().slice(0, 10)).not("status", "in", "(completed,canceled)");
  }
  const { data: rows, error } = await query;
  if (error) return apiError(error.message, 500);

  const projectIds = Array.from(new Set((rows ?? []).map((row) => row.project_id).filter(Boolean)));
  const roomIds = Array.from(new Set((rows ?? []).map((row) => row.room_id).filter(Boolean)));
  const [{ data: projects }, { data: memberships }, { data: roomMemberships }] = await Promise.all([
    projectIds.length ? db.from("team_projects").select("*").in("id", projectIds) : Promise.resolve({ data: [] }),
    projectIds.length ? db.from("project_members").select("project_id,member_id,role").in("project_id", projectIds) : Promise.resolve({ data: [] }),
    roomIds.length
      ? db.from("chat_room_members").select("room_id,member_id").in("room_id", roomIds).eq("member_id", context.actor.id)
      : Promise.resolve({ data: [] }),
  ]);
  const projectById = new Map((projects ?? []).map((project) => [project.id, project]));
  const membersByProject = new Map<string, Array<{ member_id: string; role: string }>>();
  for (const membership of memberships ?? []) {
    const list = membersByProject.get(membership.project_id) ?? [];
    list.push(membership);
    membersByProject.set(membership.project_id, list);
  }
  const joinedRooms = new Set((roomMemberships ?? []).map((membership) => membership.room_id));
  const visible = (rows ?? []).filter((row) => {
    const project = row.project_id ? projectById.get(row.project_id) : null;
    return canViewTask(context.actor, {
      assignee_id: row.assignee_id,
      created_by: row.created_by,
      project: project ? {
        created_by: project.created_by,
        owner_id: project.owner_id,
        members: membersByProject.get(project.id) ?? [],
      } : null,
      projectMember: Boolean(project && canViewProject(context.actor, {
        created_by: project.created_by,
        owner_id: project.owner_id,
        members: membersByProject.get(project.id) ?? [],
      })),
      roomMember: Boolean(row.room_id && joinedRooms.has(row.room_id)),
    });
  });
  const memberIds = Array.from(new Set(visible.flatMap((row) => [row.assignee_id, row.created_by].filter(Boolean))));
  const { data: members } = memberIds.length
    ? await db.from("chat_members").select("id,email,display_name,avatar_url").in("id", memberIds)
    : { data: [] };
  const memberById = new Map((members ?? []).map((member) => [member.id, member]));
  return apiOk({
    tasks: visible.map((task) => ({
      ...task,
      assignee: task.assignee_id ? memberById.get(task.assignee_id) ?? null : null,
      creator: memberById.get(task.created_by) ?? null,
      project: task.project_id ? projectById.get(task.project_id) ?? null : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const input = validateTaskInput(await req.json().catch(() => null));
  if (!input.ok) return apiError(input.error);
  const value = input.value;
  if (value.assigneeId && !(await memberExists(value.assigneeId))) return apiError("담당자를 찾을 수 없습니다.");

  let projectId = value.projectId;
  const db = getSupabaseAdmin();
  if (value.roomId) {
    if (!(await roomIsAccessible(value.roomId, context.actor.id)) && !context.actor.isAdmin) {
      return apiError("채팅방 접근 권한이 없습니다.", 403);
    }
    const { data: room } = await db.from("chat_rooms").select("project_id").eq("id", value.roomId).maybeSingle();
    if (!room) return apiError("채팅방을 찾을 수 없습니다.");
    projectId = projectId ?? room.project_id;
  }
  if (projectId) {
    const project = await loadProjectPermission(projectId);
    if (!project) return apiError("프로젝트를 찾을 수 없습니다.");
    if (!canViewProject(context.actor, project.permission)) return apiError("프로젝트 접근 권한이 없습니다.", 403);
  }
  if (value.sourceMessageId) {
    if (!value.roomId) return apiError("원본 메시지를 연결하려면 채팅방이 필요합니다.");
    if (!(await sourceMessageBelongsToRoom(value.sourceMessageId, value.roomId))) {
      return apiError("원본 메시지가 해당 채팅방에 속하지 않습니다.");
    }
  }

  const { data: task, error } = await db.from("team_tasks").insert({
    title: value.title,
    description: value.description,
    assignee_id: value.assigneeId,
    project_id: projectId,
    room_id: value.roomId,
    source_message_id: value.sourceMessageId,
    priority: value.priority,
    status: value.status,
    start_date: value.startDate,
    due_date: value.dueDate,
    created_by: context.actor.id,
  }).select("*").single();
  if (error || !task) return apiError(error?.message ?? "업무 생성에 실패했습니다.", 500);
  if (value.checklist.length) {
    const { error: checklistError } = await db.from("team_task_checklists").insert(
      value.checklist.map((content, sortOrder) => ({ task_id: task.id, content, sort_order: sortOrder }))
    );
    if (checklistError) return apiError(checklistError.message, 500);
  }
  await Promise.all([
    recordTaskEvent({ taskId: task.id, actorId: context.actor.id, eventType: "created", toValue: task.status }),
    value.assigneeId
      ? recordTaskEvent({ taskId: task.id, actorId: context.actor.id, eventType: "assigned", toValue: value.assigneeId })
      : Promise.resolve(),
    recalculateProjectProgress(projectId),
  ]);
  return apiOk({ task }, 201);
}
