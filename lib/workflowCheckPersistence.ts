import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveWorkflowPosition,
  effectiveWorkflowChecks,
  nextWorkflowCheck,
  setWorkflowCheck,
  type WorkflowCheckActor,
  type WorkflowChecksState,
} from "@/lib/workflowChecks";

export async function writeWorkflowCheck(
  db: SupabaseClient,
  input: {
    workflowRunId: string;
    key: string;
    done: boolean;
    by: WorkflowCheckActor;
    at?: string;
    label?: string;
  },
) {
  const { data: run, error: readError } = await db
    .from("workflow_runs")
    .select("id,checks,current_step_key,status,completed_at")
    .eq("id", input.workflowRunId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!run) throw new Error("촬영 건을 찾지 못했습니다.");

  const current = effectiveWorkflowChecks({
    checks: run.checks,
    currentStepKey: run.current_step_key,
    status: run.status,
  });
  const checks = setWorkflowCheck({ ...input, checks: current });
  return persistWorkflowChecks(db, run.id, checks);
}

export async function writeWorkflowCheckSafely(
  db: SupabaseClient,
  input: Parameters<typeof writeWorkflowCheck>[1],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await writeWorkflowCheck(db, input);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[workflow-check] 자동 체크 기록 실패", { key: input.key, workflowRunId: input.workflowRunId, message });
    return { ok: false, error: message };
  }
}

export async function writeWorkflowChecks(
  db: SupabaseClient,
  input: {
    workflowRunId: string;
    updates: Array<{ key: string; done: boolean; by: WorkflowCheckActor; at?: string; label?: string }>;
  },
) {
  const { data: run, error: readError } = await db
    .from("workflow_runs")
    .select("id,checks,current_step_key,status")
    .eq("id", input.workflowRunId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!run) throw new Error("촬영 건을 찾지 못했습니다.");

  let checks = effectiveWorkflowChecks({ checks: run.checks, currentStepKey: run.current_step_key, status: run.status });
  for (const update of input.updates) checks = setWorkflowCheck({ ...update, checks });
  return persistWorkflowChecks(db, run.id, checks);
}

export async function persistWorkflowChecks(db: SupabaseClient, workflowRunId: string, checks: WorkflowChecksState) {
  const position = deriveWorkflowPosition(checks);
  const next = nextWorkflowCheck(checks);
  const now = new Date().toISOString();
  const patch = {
    checks,
    current_step_key: position.currentStepKey,
    status: position.status,
    next_action: position.status === "completed" ? "전체 워크플로우 완료" : next?.nextActionLabel ?? null,
    completed_at: position.status === "completed" ? now : null,
    updated_at: now,
  };
  const { data, error } = await db
    .from("workflow_runs")
    .update(patch)
    .eq("id", workflowRunId)
    .select("id,checks,current_step_key,status,completed_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
