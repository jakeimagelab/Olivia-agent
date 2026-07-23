import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canViewTask } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, loadTaskPermission } from "@/lib/teamWorkspace/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export async function GET(req: NextRequest) {
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const date = todayKst();
  const db = getSupabaseAdmin();
  const [{ data: allTasks, error }, { data: goals }, { data: members }] = await Promise.all([
    db.from("team_tasks").select("*").neq("status", "canceled").order("due_date", { nullsFirst: false }),
    db.from("daily_goals").select("*").eq("goal_date", date),
    db.from("chat_members").select("id,email,display_name,avatar_url,is_admin").order("display_name"),
  ]);
  if (error) return apiError(error.message, 500);

  const visibleTasks = context.actor.isAdmin
    ? allTasks ?? []
    : (await Promise.all((allTasks ?? []).map(async (task) => {
        const access = await loadTaskPermission(task.id, context.actor.id);
        return access && canViewTask(context.actor, access.permission) ? task : null;
      }))).filter(Boolean);
  const memberById = new Map((members ?? []).map((member) => [member.id, member]));
  const enrich = (task: any) => ({
    ...task,
    assignee: task.assignee_id ? memberById.get(task.assignee_id) ?? null : null,
  });
  const myTasks = (visibleTasks as any[]).filter((task) => task.assignee_id === context.actor.id);
  const overdue = (visibleTasks as any[]).filter(
    (task) => task.due_date && task.due_date < date && !["completed", "canceled"].includes(task.status)
  );
  const reviewRequests = (visibleTasks as any[]).filter((task) => task.status === "review");
  const todayTasks = myTasks.filter((task) => task.due_date === date || task.start_date === date);
  const goalByMember = new Map((goals ?? []).map((goal) => [goal.member_id, goal]));
  const stats = (members ?? []).map((member) => {
    const assigned = (allTasks ?? []).filter((task) => task.assignee_id === member.id);
    return {
      member,
      goal: goalByMember.get(member.id) ?? null,
      completedCount: assigned.filter((task) => task.status === "completed").length,
      inProgressCount: assigned.filter((task) => task.status === "in_progress").length,
      reviewCount: assigned.filter((task) => task.status === "review").length,
      todayCount: assigned.filter((task) => task.due_date === date || task.start_date === date).length,
    };
  });
  return apiOk({
    date,
    isAdmin: context.actor.isAdmin,
    currentMember: context.member,
    goal: goalByMember.get(context.actor.id) ?? null,
    myTasks: myTasks.map(enrich),
    todayTasks: todayTasks.map(enrich),
    overdue: overdue.map(enrich),
    reviewRequests: reviewRequests.map(enrich),
    admin: context.actor.isAdmin ? {
      reviewRequests: reviewRequests.map(enrich),
      overdue: overdue.map(enrich),
      unassigned: (allTasks ?? []).filter((task) => !task.assignee_id).map(enrich),
      missingGoals: (members ?? []).filter((member) => !goalByMember.has(member.id)),
      memberStats: stats,
    } : null,
  });
}
