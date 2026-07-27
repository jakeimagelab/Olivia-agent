import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 고객 상세 화면 상단 "요약 정보 카드"에 필요한 5개 숫자를 한 번에 모아 내려준다.
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const workflowRunId = req.nextUrl.searchParams.get("workflowRunId");
  const hospitalName = req.nextUrl.searchParams.get("hospitalName") || "";
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId가 필요합니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const [runsRes, publicationsRes, revisionsRes, scheduleRes] = await Promise.all([
    db.from("workflow_runs").select("id, status").eq("client_id", clientId).neq("status", "canceled"),
    workflowRunId
      ? db.from("pcrm_publications").select("status").eq("client_id", clientId).eq("workflow_run_id", workflowRunId)
      : Promise.resolve({ data: [] as any[] }),
    db.from("client_revision_requests").select("status").eq("client_id", clientId),
    hospitalName
      ? db.from("calendar_tasks").select("date").or(`title.ilike.%${hospitalName}%,memo.ilike.%${hospitalName}%`).gte("date", todayStr).lte("date", weekEnd)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const activeProjectCount = (runsRes.data ?? []).filter((r: any) => r.status === "active").length;
  const pendingApprovalCount = (publicationsRes.data ?? []).filter((p: any) => p.status === "revision_requested" || p.status === "published").length;
  const openRevisionCount = (revisionsRes.data ?? []).filter((r: any) => r.status === "requested" || r.status === "in_progress").length;
  const thisWeekScheduleCount = (scheduleRes.data ?? []).length;

  return NextResponse.json({
    ok: true,
    summary: { activeProjectCount, pendingApprovalCount, openRevisionCount, thisWeekScheduleCount },
  });
}
