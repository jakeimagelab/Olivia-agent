import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildWorkflowNextAction } from "@/lib/workflowNextAction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const workflowRunId = new URL(req.url).searchParams.get("workflowRunId");
  return handle(workflowRunId);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return handle(body.workflowRunId || body.workflow_run_id);
}

async function handle(workflowRunId?: string | null) {
  if (!workflowRunId) return NextResponse.json({ ok: false, error: "workflowRunId 필수" }, { status: 400 });
  const db = getSupabaseAdmin();

  try {
    const { data: run, error: runError } = await db.from("workflow_runs").select("*").eq("id", workflowRunId).single();
    if (runError || !run) throw new Error(runError?.message || "workflow_run not found");

    const [tasksRes, approvalsRes, mailingRes] = await Promise.all([
      db.from("agent_tasks").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }),
      db.from("agent_approvals").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }),
      db.from("mailing_queue").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }),
    ]);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (approvalsRes.error) throw new Error(approvalsRes.error.message);

    const action = buildWorkflowNextAction({
      run,
      tasks: tasksRes.data || [],
      approvals: approvalsRes.data || [],
      mailing: mailingRes.data || [],
    });

    return NextResponse.json({
      ok: true,
      workflowRunId: action.workflowRunId,
      clientId: action.clientId,
      currentStepKey: action.currentStepKey,
      currentStepName: action.currentStepName,
      nextActionLabel: action.label,
      primaryAction: action.primaryAction,
      primaryActionLabel: action.primaryActionLabel,
      tasks: action.tasks,
      approvals: action.approvals,
      mailing: action.mailing,
      canRunTasks: action.canRun,
      canApprove: action.canApprove,
      canSendMail: action.canSendMail,
      canAdvance: action.canAdvance,
      blockedReason: action.blockedReason,
      severity: action.severity,
      progress: action.progress,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
