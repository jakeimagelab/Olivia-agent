import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canEditProject, canViewProject } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, loadProjectPermission, memberExists } from "@/lib/teamWorkspace/server";
import { isUuid, validateProjectInput } from "@/lib/teamWorkspace/validation";

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
  const [{ data: memberships }, { data: tasks }, { data: room }, { data: events }] = await Promise.all([
    db.from("project_members").select("member_id,role,joined_at").eq("project_id", projectId),
    db.from("team_tasks").select("*").eq("project_id", projectId).neq("status", "canceled").order("due_date"),
    db.from("chat_rooms").select("*").eq("project_id", projectId).maybeSingle(),
    db.from("team_task_events").select("*,team_tasks!inner(project_id,title)").eq("team_tasks.project_id", projectId).order("created_at", { ascending: false }).limit(20),
  ]);
  const memberIds = Array.from(new Set((memberships ?? []).map((item) => item.member_id)));
  const { data: members } = memberIds.length
    ? await db.from("chat_members").select("id,email,display_name,avatar_url").in("id", memberIds)
    : { data: [] };
  const memberById = new Map((members ?? []).map((member) => [member.id, member]));
  return apiOk({
    project: access.row,
    members: (memberships ?? []).map((item) => ({ ...item, member: memberById.get(item.member_id) ?? null })),
    tasks: tasks ?? [],
    room,
    recentEvents: events ?? [],
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!isUuid(projectId)) return apiError("프로젝트 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadProjectPermission(projectId);
  if (!access) return apiError("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(context.actor, access.permission)) return apiError("수정 권한이 없습니다.", 403);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const input = validateProjectInput({
    name: body?.name ?? access.row.name,
    description: body?.description ?? access.row.description,
    projectType: body?.projectType ?? body?.project_type ?? access.row.project_type,
    status: body?.status ?? access.row.status,
    priority: body?.priority ?? access.row.priority,
    clientId: body?.clientId ?? body?.client_id ?? access.row.client_id,
    workflowRunId: body?.workflowRunId ?? body?.workflow_run_id ?? access.row.workflow_run_id,
    ownerId: body?.ownerId ?? body?.owner_id ?? access.row.owner_id,
    startDate: body?.startDate ?? body?.start_date ?? access.row.start_date,
    dueDate: body?.dueDate ?? body?.due_date ?? access.row.due_date,
    createChatRoom: false,
  });
  if (!input.ok) return apiError(input.error);
  if (input.value.ownerId && !(await memberExists(input.value.ownerId))) return apiError("책임자를 찾을 수 없습니다.");
  const now = new Date().toISOString();
  const { data: project, error } = await getSupabaseAdmin().from("team_projects").update({
    name: input.value.name,
    description: input.value.description,
    project_type: input.value.projectType,
    status: input.value.status,
    priority: input.value.priority,
    client_id: input.value.clientId,
    workflow_run_id: input.value.workflowRunId,
    owner_id: input.value.ownerId,
    start_date: input.value.startDate,
    due_date: input.value.dueDate,
    completed_at: input.value.status === "completed" ? access.row.completed_at ?? now : null,
    updated_at: now,
  }).eq("id", projectId).select("*").single();
  if (error) return apiError(error.message, 500);
  return apiOk({ project });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!isUuid(projectId)) return apiError("프로젝트 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadProjectPermission(projectId);
  if (!access) return apiError("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(context.actor, access.permission)) return apiError("삭제 권한이 없습니다.", 403);
  const { error } = await getSupabaseAdmin().from("team_projects").update({
    status: "canceled",
    updated_at: new Date().toISOString(),
  }).eq("id", projectId);
  if (error) return apiError(error.message, 500);
  return apiOk({});
}
