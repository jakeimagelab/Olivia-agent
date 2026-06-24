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
      db.from("mailing_queue").select("id,status").in("status", ["draft", "ready"]).limit(100),
    ]);

    if (runsRes.error) throw runsRes.error;
    if (tasksRes.error) throw tasksRes.error;
    if (approvalsRes.error) throw approvalsRes.error;

    const runs = runsRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const approvals = approvalsRes.data ?? [];
    const todayTasks = tasks.filter((task) => String(task.created_at || "").startsWith(today()) || task.status === "pending");
    const pendingApprovals = approvals.filter((approval) => approval.status === "pending");

    const workflowRuns = runs.map((run) => ({
      ...run,
      current_step_name: STEP_NAME[run.current_step_key] || run.current_step_key,
      delayed: Boolean(run.shoot_date && run.shoot_date < today() && run.status === "active"),
      waiting_approval_count: pendingApprovals.filter((approval) => approval.workflow_run_id === run.id).length,
    }));

    return NextResponse.json({
      ok: true,
      summary: {
        activeClients: runs.filter((run) => run.status === "active").length,
        todayTasks: todayTasks.length,
        pendingApprovals: pendingApprovals.length,
        pendingMailing: mailingRes.data?.length ?? 0,
        shootingToday: runs.filter((run) => run.shoot_date === today()).length,
        galleryWaiting: tasks.filter((task) => task.task_type === "gallery_delivery" || task.workflow_step_key === "gallery_delivery").length,
        reviewWaiting: tasks.filter((task) => task.task_type === "review_request" || task.workflow_step_key === "review_request").length,
        perWaiting: tasks.filter((task) => task.task_type === "per_points" || task.workflow_step_key === "per_points").length,
      },
      priorityTasks: tasks.slice(0, 8),
      approvals: pendingApprovals.slice(0, 8),
      workflowRuns,
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
      },
      priorityTasks: MOCK_AGENT_TASKS,
      approvals: pendingApprovals,
      workflowRuns: MOCK_WORKFLOW_RUNS,
    });
  }
}
