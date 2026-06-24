import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getSupabaseAdmin();

  // 서버가 UTC여도 한국 시간(KST) 기준 날짜를 사용
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const [mailingRes, runsRes, approvalsRes, ideaRes, memosRes, tasksRes] = await Promise.all([
    db.from("mailing_queue")
      .select("id, type, hospital_name, status, created_at")
      .in("status", ["draft", "ready", "failed"])
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("workflow_runs")
      .select("id, client_id, client_name, current_step_key, status, updated_at")
      .eq("status", "active"),
    db.from("agent_approvals")
      .select("workflow_run_id")
      .eq("status", "pending"),
    db.from("daily_ideas")
      .select("date, marketing_idea, mission")
      .order("date", { ascending: false })
      .limit(1),
    db.from("consultation_memos")
      .select("id, raw_memo, created_at, hospital_id")
      .order("created_at", { ascending: false })
      .limit(5),
    db.from("calendar_tasks")
      .select("id, title, category, completed, date, time, location, memo")
      .eq("date", todayStr)
      .order("created_at", { ascending: true }),
  ]);

  const mailing    = mailingRes.data ?? [];
  const activeRuns = runsRes.data ?? [];
  const idea       = ideaRes.data?.[0] ?? null;
  const memos      = memosRes.data ?? [];
  const todayTasks = tasksRes.data ?? [];

  const pendingApprovalRunIds = new Set(
    (approvalsRes.data ?? []).map((a: { workflow_run_id: string }) => a.workflow_run_id)
  );

  const toItem = (run: { id: string; client_id: string; client_name: string; current_step_key: string; updated_at: string }) => ({
    id: run.client_id,
    name: run.client_name,
    current_step_key: run.current_step_key,
    updated_at: run.updated_at,
  });

  return NextResponse.json({
    ok: true,
    mailing: {
      pending: mailing.filter(m => m.status === "draft" || m.status === "ready"),
      failed:  mailing.filter(m => m.status === "failed"),
      recent:  mailing.slice(0, 8),
    },
    clients: {
      quoteFollowUp:   activeRuns.filter(r => r.current_step_key === "quote" && pendingApprovalRunIds.has(r.id)).map(toItem),
      contractPending: activeRuns.filter(r => r.current_step_key === "contract").map(toItem),
      galleryPending:  activeRuns.filter(r => r.current_step_key === "final_delivery").map(toItem),
      reviewPending:   activeRuns.filter(r => r.current_step_key === "review_content").map(toItem),
      snsPending:      activeRuns.filter(r => r.current_step_key === "content_planning").map(toItem),
    },
    todayIdea:   idea,
    recentMemos: memos,
    todayTasks,
  });
}
