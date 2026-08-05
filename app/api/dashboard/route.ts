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

  // 워크스페이스 할일 중 오늘 마감이거나(due_date) 오늘 캘린더 일정(calendar_task_id)에 연동된 것만
  // 요약해서 보여준다. 팀채팅 로그인 여부와 무관하게 관리자 세션만으로 조회 가능해야 하므로
  // /api/team/tasks가 아닌 이 라우트에서 직접 team_tasks를 조회한다.
  const todayCalendarTaskIds = todayTasks.map((row) => row.id);
  const [dueTodayRes, calendarLinkedRes] = await Promise.all([
    db.from("team_tasks")
      .select("id, title, status, due_date, calendar_task_id")
      .eq("due_date", todayStr)
      .not("status", "in", "(completed,canceled)"),
    todayCalendarTaskIds.length
      ? db.from("team_tasks")
          .select("id, title, status, due_date, calendar_task_id")
          .in("calendar_task_id", todayCalendarTaskIds)
          .not("status", "in", "(completed,canceled)")
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const workspaceTaskById = new Map<string, { id: string; title: string; status: string; due_date: string | null; calendar_task_id: string | null }>();
  for (const row of [...(dueTodayRes.data ?? []), ...(calendarLinkedRes.data ?? [])]) workspaceTaskById.set(row.id, row);
  const workspaceTaskIds = Array.from(workspaceTaskById.keys());
  const { data: workspaceChecklists } = workspaceTaskIds.length
    ? await db.from("team_task_checklists").select("task_id, completed").in("task_id", workspaceTaskIds)
    : { data: [] as any[] };
  const checklistProgressByTask = new Map<string, { total: number; done: number }>();
  for (const item of workspaceChecklists ?? []) {
    const current = checklistProgressByTask.get(item.task_id) ?? { total: 0, done: 0 };
    current.total += 1;
    if (item.completed) current.done += 1;
    checklistProgressByTask.set(item.task_id, current);
  }
  const workspaceTodayTasks = workspaceTaskIds.map((id) => ({
    ...workspaceTaskById.get(id)!,
    checklistProgress: checklistProgressByTask.get(id) ?? null,
  }));

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
