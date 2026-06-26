import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_AGENT_TASKS, MOCK_APPROVALS, MOCK_WORKFLOW_RUNS, STEP_NAME } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const [runsRes, tasksRes, approvalsRes, mailingRes] = await Promise.all([
      db.from("workflow_runs").select("*").order("updated_at", { ascending: false }),
      db.from("agent_tasks").select("*").order("created_at", { ascending: false }),
      db.from("agent_approvals").select("*").order("created_at", { ascending: false }),
      db.from("mailing_queue").select("*").in("status", ["draft", "ready"]).order("created_at", { ascending: false }).limit(100),
    ]);

    if (runsRes.error) throw runsRes.error;
    if (tasksRes.error) throw tasksRes.error;
    if (approvalsRes.error) throw approvalsRes.error;

    const runs = runsRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const approvals = approvalsRes.data ?? [];
    const todayTasks = tasks.filter((task) => String(task.created_at || "").startsWith(today()) || task.status === "pending");
    const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
    const readyMailing = (mailingRes.data ?? []).filter((mail) => mail.status === "ready");
    const failedTasks = tasks.filter((task) => task.status === "failed");
    const openTaskKeys = new Set(tasks.filter((task) => ["pending", "running", "waiting_approval", "failed"].includes(task.status)).map((task) => `${task.workflow_run_id}:${task.workflow_step_key}`));
    const openApprovalKeys = new Set(approvals.filter((approval) => ["pending", "revision_requested"].includes(approval.status)).map((approval) => `${approval.workflow_run_id}:${approval.workflow_step_key}`));

    const workflowRuns = runs.map((run) => ({
      ...run,
      current_step_name: STEP_NAME[run.current_step_key] || run.current_step_key,
      delayed: Boolean(run.shoot_date && run.shoot_date < today() && run.status === "active"),
      waiting_approval_count: pendingApprovals.filter((approval) => approval.workflow_run_id === run.id).length,
      has_ready_mail: readyMailing.some((mail) => mail.workflow_run_id === run.id),
      has_open_task: tasks.some((task) => task.workflow_run_id === run.id && ["pending", "running", "waiting_approval", "failed"].includes(task.status)),
      can_advance: !openTaskKeys.has(`${run.id}:${run.current_step_key}`) && !openApprovalKeys.has(`${run.id}:${run.current_step_key}`),
    }));
    const movableRuns = workflowRuns.filter((run) => run.status === "active" && run.can_advance);

    return NextResponse.json({
      ok: true,
      summary: {
        activeClients: runs.filter((run) => run.status === "active").length,
        todayTasks: todayTasks.length,
        pendingApprovals: pendingApprovals.length,
        pendingMailing: mailingRes.data?.length ?? 0,
        shootingToday: runs.filter((run) => run.shoot_date === today()).length,
        galleryWaiting: tasks.filter((task) => task.workflow_step_key === "final_delivery").length,
        reviewWaiting: tasks.filter((task) => task.workflow_step_key === "review_content").length,
        perWaiting: tasks.filter((task) => task.workflow_step_key === "reward").length,
        failedTasks: failedTasks.length,
        readyMailing: readyMailing.length,
        movableRuns: movableRuns.length,
      },
      priorityTasks: tasks.slice(0, 8),
      approvals: pendingApprovals.slice(0, 8),
      workflowRuns,
      automation: {
        todayCreatedTasks: tasks.filter((task) => String(task.created_at || "").startsWith(today())).slice(0, 12),
        readyMailing: readyMailing.slice(0, 12),
        waitingCustomer: workflowRuns.filter((run) => ["quote", "contract", "conti", "final_delivery"].includes(run.current_step_key)).slice(0, 12),
        delayedRuns: workflowRuns.filter((run) => run.delayed).slice(0, 12),
        movableRuns: movableRuns.slice(0, 12),
        failedTasks: failedTasks.slice(0, 12),
        perWaiting: tasks.filter((task) => task.workflow_step_key === "reward" && task.status !== "completed").slice(0, 12),
      },
    });
  } catch (error) {
    const pendingApprovals = MOCK_APPROVALS.filter((approval) => approval.status === "pending");
    return NextResponse.json({
      ok: true,
      mock: true,
      note: error instanceof Error ? error.message : String(error),
      summary: {
        activeClients: MOCK_WORKFLOW_RUNS.length,
        todayTasks: MOCK_AGENT_TASKS.length,
        pendingApprovals: pendingApprovals.length,
        pendingMailing: 2,
        shootingToday: 1,
        galleryWaiting: 1,
        reviewWaiting: 1,
        perWaiting: 1,
        failedTasks: 0,
        readyMailing: 1,
        movableRuns: 1,
      },
      priorityTasks: MOCK_AGENT_TASKS,
      approvals: pendingApprovals,
      workflowRuns: MOCK_WORKFLOW_RUNS,
      automation: {
        todayCreatedTasks: MOCK_AGENT_TASKS,
        readyMailing: [{ id: "mail-sample-1", hospital_name: "운정표병원", subject: "[포토클리닉] 최종 촬영본 공유", status: "ready" }],
        waitingCustomer: MOCK_WORKFLOW_RUNS.slice(0, 2),
        delayedRuns: MOCK_WORKFLOW_RUNS.filter((run) => run.delayed),
        movableRuns: MOCK_WORKFLOW_RUNS.slice(0, 1),
        failedTasks: [],
        perWaiting: MOCK_AGENT_TASKS.filter((task) => task.workflow_step_key === "reward"),
      },
    });
  }
}
