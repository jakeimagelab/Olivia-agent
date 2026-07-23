import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiError, apiOk, getTeamWorkspaceContext } from "@/lib/teamWorkspace/server";
import { validateGoalInput } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export async function GET(req: NextRequest) {
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const { data: goal, error } = await getSupabaseAdmin()
    .from("daily_goals")
    .select("*")
    .eq("member_id", context.actor.id)
    .eq("goal_date", todayKst())
    .maybeSingle();
  if (error) return apiError(error.message, 500);
  return apiOk({ goal });
}

export async function PUT(req: NextRequest) {
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const input = validateGoalInput(await req.json().catch(() => null));
  if (!input.ok) return apiError(input.error);
  const now = new Date().toISOString();
  const { data: goal, error } = await getSupabaseAdmin().from("daily_goals").upsert({
    member_id: context.actor.id,
    goal_date: todayKst(),
    title: input.value.title,
    success_criteria: input.value.successCriteria,
    updated_at: now,
  }, { onConflict: "member_id,goal_date" }).select("*").single();
  if (error) return apiError(error.message, 500);
  return apiOk({ goal });
}
