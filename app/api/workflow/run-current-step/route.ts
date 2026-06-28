import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createStepTasks, executeWorkflowTask, getWorkflowRun, maybeAdvanceWorkflow } from "@/lib/workflowAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const workflowRunId = body.workflowRunId || body.workflow_run_id;
  if (!workflowRunId) return NextResponse.json({ ok: false, error: "workflowRunId 필수" }, { status: 400 });

  const db = getSupabaseAdmin();
  try {
    const run = await getWorkflowRun(db, workflowRunId);
    const stepKey = run.current_step_key;
    const createdResult = await createStepTasks(db, workflowRunId, stepKey);

    const { data: pendingTasks, error } = await db
      .from("agent_tasks")
      .select("*")
      .eq("workflow_run_id", workflowRunId)
      .eq("workflow_step_key", stepKey)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const results = [];
    for (const task of pendingTasks || []) {
      results.push(await executeWorkflowTask(db, task.id));
    }

    const { data: approvals } = await db
      .from("agent_approvals")
      .select("id")
      .eq("workflow_run_id", workflowRunId)
      .eq("workflow_step_key", stepKey)
      .eq("status", "pending");

    const advanceResult = (approvals || []).length ? { advanced: false, reason: "waiting_approval" } : await maybeAdvanceWorkflow(db, workflowRunId, stepKey);
    const nextStepKey = advanceResult.advanced && "result" in advanceResult
      ? advanceResult.result?.to_step_key ?? null
      : null;

    return NextResponse.json({
      ok: true,
      createdTasks: createdResult.created?.length || 0,
      executedTasks: results.length,
      waitingApprovals: approvals?.length || 0,
      advanced: Boolean(advanceResult.advanced),
      currentStepKey: stepKey,
      nextStepKey,
      message: buildMessage(results.length, approvals?.length || 0, Boolean(advanceResult.advanced)),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

function buildMessage(executed: number, approvals: number, advanced: boolean) {
  if (approvals > 0) return `${executed}개 작업을 처리했고 승인 대기 ${approvals}개가 생성되었습니다.`;
  if (advanced) return `${executed}개 작업을 처리하고 다음 단계로 이동했습니다.`;
  return `${executed}개 작업을 처리했습니다.`;
}
