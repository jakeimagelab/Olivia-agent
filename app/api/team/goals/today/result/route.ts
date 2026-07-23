import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiError, apiOk, getTeamWorkspaceContext } from "@/lib/teamWorkspace/server";
import { validateGoalResult } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export async function PATCH(req: NextRequest) {
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const input = validateGoalResult(await req.json().catch(() => null));
  if (!input.ok) return apiError(input.error);
  const { data: goal, error } = await getSupabaseAdmin().from("daily_goals").update({
    status: input.value.status,
    result_note: input.value.resultNote,
    updated_at: new Date().toISOString(),
  }).eq("member_id", context.actor.id).eq("goal_date", todayKst()).select("*").maybeSingle();
  if (error) return apiError(error.message, 500);
  if (!goal) return apiError("먼저 오늘의 핵심 목표를 작성해주세요.", 404);
  return apiOk({ goal });
}
