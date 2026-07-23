import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiError, apiOk, getTeamWorkspaceContext } from "@/lib/teamWorkspace/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const date = new URL(req.url).searchParams.get("date")
    ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiError("날짜 형식이 올바르지 않습니다.");
  const db = getSupabaseAdmin();
  let query = db.from("daily_goals").select("*").eq("goal_date", date);
  if (!context.actor.isAdmin) query = query.eq("member_id", context.actor.id);
  const { data: goals, error } = await query.order("created_at");
  if (error) return apiError(error.message, 500);
  const memberIds = (goals ?? []).map((goal) => goal.member_id);
  const { data: members } = memberIds.length
    ? await db.from("chat_members").select("id,email,display_name,avatar_url").in("id", memberIds)
    : { data: [] };
  const byId = new Map((members ?? []).map((member) => [member.id, member]));
  return apiOk({ date, goals: (goals ?? []).map((goal) => ({ ...goal, member: byId.get(goal.member_id) ?? null })) });
}
