import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createStepTasks, executeWorkflowTask, getWorkflowRun, maybeAdvanceWorkflow } from "@/lib/workflowAutomation";
import { getErrorMessage } from "@/lib/errors";

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

    // executeWorkflowTask는 작업이 끝날 때마다 내부적으로 이미 maybeAdvanceWorkflow를 호출한다 —
    // 그래서 이 시점엔 이미 다음 단계로 넘어가 있을 수 있다. 그 상태에서 아래처럼 같은(오래된)
    // stepKey로 다시 advance를 시도하면 "현재 단계가 바뀌었다"는 가드에 걸려 advanced:false로
    // 잘못 보고된다(실제로는 성공했는데 실패한 것처럼 보이는 버그) — 먼저 최신 상태를 다시 읽어서
    // 이미 넘어갔는지 확인한다.
    const latestRun = await getWorkflowRun(db, workflowRunId);
    const advanceResult = latestRun.current_step_key !== stepKey
      ? { advanced: true as const, result: { to_step_key: latestRun.current_step_key } }
      : (approvals || []).length
        ? { advanced: false as const, reason: "waiting_approval" }
        : await maybeAdvanceWorkflow(db, workflowRunId, stepKey);
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
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

function buildMessage(executed: number, approvals: number, advanced: boolean) {
  if (approvals > 0) return `${executed}개 작업을 처리했고 승인 대기 ${approvals}개가 생성되었습니다.`;
  if (advanced) return `${executed}개 작업을 처리하고 다음 단계로 이동했습니다.`;
  return `${executed}개 작업을 처리했습니다.`;
}
