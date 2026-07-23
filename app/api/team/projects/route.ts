import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canViewProject } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, memberExists } from "@/lib/teamWorkspace/server";
import { validateProjectInput } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const db = getSupabaseAdmin();
  const [{ data: projects, error }, { data: memberships }] = await Promise.all([
    db.from("team_projects").select("*").neq("status", "canceled").order("updated_at", { ascending: false }),
    db.from("project_members").select("project_id,member_id,role"),
  ]);
  if (error) return apiError(error.message, 500);

  const membersByProject = new Map<string, Array<{ member_id: string; role: string }>>();
  for (const membership of memberships ?? []) {
    const list = membersByProject.get(membership.project_id) ?? [];
    list.push(membership);
    membersByProject.set(membership.project_id, list);
  }
  const visible = (projects ?? []).filter((project) => canViewProject(context.actor, {
    created_by: project.created_by,
    owner_id: project.owner_id,
    members: membersByProject.get(project.id) ?? [],
  }));
  const projectIds = visible.map((project) => project.id);
  const ownerIds = Array.from(new Set(visible.map((project) => project.owner_id).filter(Boolean)));
  const [{ data: owners }, { data: tasks }, { data: rooms }] = await Promise.all([
    ownerIds.length
      ? db.from("chat_members").select("id,email,display_name,avatar_url").in("id", ownerIds)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? db.from("team_tasks").select("project_id,status").in("project_id", projectIds).neq("status", "canceled")
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? db.from("chat_rooms").select("id,name,project_id").in("project_id", projectIds)
      : Promise.resolve({ data: [] }),
  ]);
  const ownerById = new Map((owners ?? []).map((owner) => [owner.id, owner]));
  const roomByProject = new Map((rooms ?? []).map((room) => [room.project_id, room]));
  const counters = new Map<string, { incompleteCount: number; reviewCount: number }>();
  for (const task of tasks ?? []) {
    const count = counters.get(task.project_id) ?? { incompleteCount: 0, reviewCount: 0 };
    if (task.status !== "completed") count.incompleteCount += 1;
    if (task.status === "review") count.reviewCount += 1;
    counters.set(task.project_id, count);
  }
  return apiOk({
    projects: visible.map((project) => ({
      ...project,
      owner: project.owner_id ? ownerById.get(project.owner_id) ?? null : null,
      room: roomByProject.get(project.id) ?? null,
      ...(counters.get(project.id) ?? { incompleteCount: 0, reviewCount: 0 }),
    })),
  });
}

export async function POST(req: NextRequest) {
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const input = validateProjectInput(await req.json().catch(() => null));
  if (!input.ok) return apiError(input.error);
  const value = input.value;
  if (value.ownerId && !(await memberExists(value.ownerId))) return apiError("책임자를 찾을 수 없습니다.");
  for (const memberId of value.memberIds) {
    if (!(await memberExists(memberId))) return apiError("프로젝트 멤버를 찾을 수 없습니다.");
  }

  const db = getSupabaseAdmin();
  const { data: project, error } = await db.from("team_projects").insert({
    name: value.name,
    description: value.description,
    project_type: value.projectType,
    status: value.status,
    priority: value.priority,
    client_id: value.clientId,
    workflow_run_id: value.workflowRunId,
    owner_id: value.ownerId,
    created_by: context.actor.id,
    start_date: value.startDate,
    due_date: value.dueDate,
  }).select("*").single();
  if (error || !project) return apiError(error?.message ?? "프로젝트 생성에 실패했습니다.", 500);

  const memberIds = Array.from(new Set([
    context.actor.id,
    ...(value.ownerId ? [value.ownerId] : []),
    ...value.memberIds,
  ]));
  if (memberIds.length) {
    const { error: memberError } = await db.from("project_members").insert(memberIds.map((memberId) => ({
      project_id: project.id,
      member_id: memberId,
      role: memberId === value.ownerId ? "owner" : memberId === context.actor.id ? "manager" : "member",
    })));
    if (memberError) return apiError(memberError.message, 500);
  }

  let room = null;
  if (value.createChatRoom) {
    const { data: createdRoom, error: roomError } = await db.from("chat_rooms").insert({
      name: project.name,
      created_by: context.actor.id,
      room_type: "project",
      project_id: project.id,
      client_id: project.client_id,
    }).select("*").single();
    if (roomError || !createdRoom) return apiError(roomError?.message ?? "프로젝트 채팅방 생성에 실패했습니다.", 500);
    room = createdRoom;
    const { error: rosterError } = await db.from("chat_room_members").insert(
      memberIds.map((memberId) => ({ room_id: createdRoom.id, member_id: memberId }))
    );
    if (rosterError) return apiError(rosterError.message, 500);
  }
  return apiOk({ project, room }, 201);
}
