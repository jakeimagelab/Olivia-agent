import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ACTIVE_WORKFLOW_STEP_KEYS,
  MOCK_AGENT_TASKS,
  MOCK_APPROVALS,
  MOCK_WORKFLOW_RUNS,
  STEP_NAME,
  WORKFLOW_STAGES,
  WORKFLOW_STEPS,
  getWorkflowDisplayStepKey,
  getWorkflowStepProgress,
} from "@/lib/workflow";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);
const CUSTOMER_WAIT_STEPS = new Set(["quote", "contract", "conti", "client_selection", "final_delivery", "revision"]);

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

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
    const revisionApprovals = approvals.filter((approval) => approval.status === "revision_requested");
    const readyMailing = (mailingRes.data ?? []).filter((mail) => mail.status === "ready");
    const failedTasks = tasks.filter((task) => task.status === "failed");
    const retentionAlerts = tasks.filter((task) => String(task.task_type || "").startsWith("data_retention_") && task.status !== "completed" && task.status !== "canceled");
    const openTaskKeys = new Set(tasks.filter((task) => ["pending", "running", "waiting_approval", "failed"].includes(task.status)).map((task) => `${task.workflow_run_id}:${task.workflow_step_key}`));
    const openApprovalKeys = new Set(approvals.filter((approval) => ["pending", "revision_requested"].includes(approval.status)).map((approval) => `${approval.workflow_run_id}:${approval.workflow_step_key}`));

    const workflowRuns = runs.map((run) => {
      const isCompleted = run.status === "completed";
      const displayStepKey = isCompleted
        ? ACTIVE_WORKFLOW_STEP_KEYS[ACTIVE_WORKFLOW_STEP_KEYS.length - 1]
        : getWorkflowDisplayStepKey(run.current_step_key) ?? run.current_step_key;
      const step = WORKFLOW_STEPS.find((candidate) => candidate.key === displayStepKey);
      const stage = WORKFLOW_STAGES.find((candidate) => candidate.key === step?.stage);
      const waitingApprovalCount = pendingApprovals.filter((approval) => approval.workflow_run_id === run.id).length;
      const revisionRequestCount = revisionApprovals.filter((approval) => approval.workflow_run_id === run.id).length;
      const waitingCustomer = run.status === "active" && CUSTOMER_WAIT_STEPS.has(displayStepKey) && waitingApprovalCount === 0;

      return {
        ...run,
        display_step_key: displayStepKey,
        current_step_name: STEP_NAME[displayStepKey] || displayStepKey,
        stage_key: stage?.key ?? "consult_contract",
        stage_name: stage?.name ?? "상담·계약",
        progress: getWorkflowStepProgress(run.current_step_key, run.status),
        delayed: Boolean(run.shoot_date && run.shoot_date < today() && run.status === "active"),
        waiting_approval_count: waitingApprovalCount,
        revision_request_count: revisionRequestCount,
        waiting_customer: waitingCustomer,
        has_ready_mail: readyMailing.some((mail) => mail.workflow_run_id === run.id),
        has_open_task: tasks.some((task) => task.workflow_run_id === run.id && ["pending", "running", "waiting_approval", "failed"].includes(task.status)),
        can_advance: !openTaskKeys.has(`${run.id}:${run.current_step_key}`) && !openApprovalKeys.has(`${run.id}:${run.current_step_key}`),
      };
    });
    const movableRuns = workflowRuns.filter((run) => run.status === "active" && run.can_advance);

    return NextResponse.json({
      ok: true,
      summary: {
        activeClients: runs.filter((run) => run.status === "active").length,
        activeProjects: runs.filter((run) => run.status === "active").length,
        completedThisMonth: runs.filter((run) => run.status === "completed" && run.completed_at && run.completed_at >= monthStart()).length,
        waitingCustomer: workflowRuns.filter((run) => run.waiting_customer).length,
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
        retentionAlerts: retentionAlerts.length,
      },
      priorityTasks: tasks.slice(0, 8),
      approvals: pendingApprovals.slice(0, 8),
      workflowRuns,
      automation: {
        todayCreatedTasks: tasks.filter((task) => String(task.created_at || "").startsWith(today())).slice(0, 12),
        readyMailing: readyMailing.slice(0, 12),
        waitingCustomer: workflowRuns.filter((run) => run.waiting_customer).slice(0, 12),
        delayedRuns: workflowRuns.filter((run) => run.delayed).slice(0, 12),
        movableRuns: movableRuns.slice(0, 12),
        failedTasks: failedTasks.slice(0, 12),
        perWaiting: tasks.filter((task) => task.workflow_step_key === "reward" && task.status !== "completed").slice(0, 12),
        retentionAlerts: retentionAlerts.slice(0, 12),
      },
    });
  } catch (error) {
    const pendingApprovals = MOCK_APPROVALS.filter((approval) => approval.status === "pending");
    return NextResponse.json({
      ok: true,
      mock: true,
      note: getErrorMessage(error),
      summary: {
        activeClients: MOCK_WORKFLOW_RUNS.length,
        activeProjects: MOCK_WORKFLOW_RUNS.length,
        completedThisMonth: 0,
        waitingCustomer: 2,
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
        retentionAlerts: 0,
      },
      priorityTasks: MOCK_AGENT_TASKS,
      approvals: pendingApprovals,
      workflowRuns: MOCK_WORKFLOW_RUNS,
      automation: {
        todayCreatedTasks: MOCK_AGENT_TASKS,
        readyMailing: [{ id: "mail-sample-1", hospital_name: "포토클리닉", subject: "[포토클리닉] 최종 촬영본 공유", status: "ready" }],
        waitingCustomer: MOCK_WORKFLOW_RUNS.slice(0, 2),
        delayedRuns: MOCK_WORKFLOW_RUNS.filter((run) => run.delayed),
        movableRuns: MOCK_WORKFLOW_RUNS.slice(0, 1),
        failedTasks: [],
        perWaiting: MOCK_AGENT_TASKS.filter((task) => task.workflow_step_key === "reward"),
        retentionAlerts: [],
      },
    });
  }
}
