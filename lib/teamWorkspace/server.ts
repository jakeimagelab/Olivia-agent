import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeamChatSupabaseServer } from "@/lib/teamChat/supabaseServer";
import type { ProjectPermissionRecord, TaskPermissionRecord, TeamActor } from "./permissions";

export type TeamWorkspaceContext = {
  actor: TeamActor;
  member: {
    id: string;
    email: string;
    display_name: string;
    avatar_url: string | null;
    is_admin: boolean;
  };
};

export async function getTeamWorkspaceContext(req: NextRequest): Promise<TeamWorkspaceContext | null> {
  const supabase = await getTeamChatSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = getSupabaseAdmin();
  const { data: member } = await db
    .from("chat_members")
    .select("id,email,display_name,avatar_url,is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!member) return null;
  const isAdmin = Boolean(member.is_admin || req.cookies.get("pc_admin_session")?.value === "active");
  return {
    actor: { id: member.id, isAdmin },
    member: { ...member, is_admin: isAdmin },
  };
}

export function apiError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function apiOk<T extends Record<string, unknown>>(payload?: T, status = 200) {
  return NextResponse.json({ ok: true, ...(payload ?? {}) }, { status });
}

export async function memberExists(memberId: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("chat_members").select("id").eq("id", memberId).maybeSingle();
  return Boolean(data);
}

export async function roomIsAccessible(roomId: string, actorId: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("chat_room_members")
    .select("room_id")
    .eq("room_id", roomId)
    .eq("member_id", actorId)
    .maybeSingle();
  return Boolean(data);
}

export async function sourceMessageBelongsToRoom(messageId: string, roomId: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("chat_messages")
    .select("id")
    .eq("id", messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  return Boolean(data);
}

export async function loadProjectPermission(projectId: string): Promise<{
  row: Record<string, any>;
  permission: ProjectPermissionRecord;
} | null> {
  const db = getSupabaseAdmin();
  const [{ data: row }, { data: members }] = await Promise.all([
    db.from("team_projects").select("*").eq("id", projectId).maybeSingle(),
    db.from("project_members").select("member_id,role").eq("project_id", projectId),
  ]);
  if (!row) return null;
  return {
    row,
    permission: {
      created_by: row.created_by,
      owner_id: row.owner_id,
      members: members ?? [],
    },
  };
}

export async function loadTaskPermission(taskId: string, actorId: string): Promise<{
  row: Record<string, any>;
  permission: TaskPermissionRecord;
} | null> {
  const db = getSupabaseAdmin();
  const { data: row } = await db.from("team_tasks").select("*").eq("id", taskId).maybeSingle();
  if (!row) return null;

  const [projectAccess, roomMembership] = await Promise.all([
    row.project_id ? loadProjectPermission(row.project_id) : Promise.resolve(null),
    row.room_id ? roomIsAccessible(row.room_id, actorId) : Promise.resolve(false),
  ]);
  return {
    row,
    permission: {
      assignee_id: row.assignee_id,
      created_by: row.created_by,
      status: row.status,
      project: projectAccess?.permission ?? null,
      projectMember: Boolean(projectAccess?.permission.members?.some((member) => member.member_id === actorId)),
      roomMember: roomMembership,
    },
  };
}
