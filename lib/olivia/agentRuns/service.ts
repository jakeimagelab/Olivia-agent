import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAgentRunTransition } from "./stateMachine";
import { planAgentRun } from "./planner";
import type { AgentRunStatus, CreateAgentRunInput, OliviaAgentRun, OliviaAgentRunStep } from "./types";

export async function createAgentRun(db: SupabaseClient, input: CreateAgentRunInput) {
  const row = {
    owner_id: input.ownerId ?? null, conversation_id: input.conversationId ?? null,
    client_id: input.clientId ?? null, workflow_run_id: input.workflowRunId ?? null,
    source: input.source ?? "chat", goal: input.goal, run_type: input.runType ?? "general",
    idempotency_key: input.idempotencyKey, context: input.context ?? {}, metadata: input.metadata ?? {},
  };
  const inserted = await db.from("olivia_agent_runs").insert(row).select("*").maybeSingle();
  if (inserted.error?.code === "23505") {
    const existing = await db.from("olivia_agent_runs").select("*").eq("idempotency_key", input.idempotencyKey).single();
    if (existing.error) throw new Error(existing.error.message);
    return { run: existing.data as OliviaAgentRun, duplicate: true };
  }
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "Agent Run을 만들지 못했어요.");
  const run = inserted.data as OliviaAgentRun;
  const steps = planAgentRun(input).map((step) => ({ ...step, run_id: run.id }));
  const stepInsert = await db.from("olivia_agent_run_steps").insert(steps);
  if (stepInsert.error) throw new Error(stepInsert.error.message);
  await appendAgentRunEvent(db, run.id, "run_created", "업무를 접수했어요.", { goal: input.goal });
  return { run, duplicate: false };
}

export async function appendAgentRunEvent(db: SupabaseClient, runId: string, eventType: string, message: string, payload: Record<string, unknown> = {}) {
  const { error } = await db.from("olivia_agent_run_events").insert({ run_id: runId, event_type: eventType, message, payload });
  if (error) throw new Error(error.message);
}

export async function getAgentRun(db: SupabaseClient, id: string) {
  const [runResult, stepsResult, eventsResult] = await Promise.all([
    db.from("olivia_agent_runs").select("*").eq("id", id).maybeSingle(),
    db.from("olivia_agent_run_steps").select("*").eq("run_id", id).order("order_index"),
    db.from("olivia_agent_run_events").select("*").eq("run_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (runResult.error) throw new Error(runResult.error.message);
  if (!runResult.data) return null;
  return { run: runResult.data as OliviaAgentRun, steps: (stepsResult.data ?? []) as OliviaAgentRunStep[], events: eventsResult.data ?? [] };
}

export async function listAgentRuns(db: SupabaseClient, statuses?: AgentRunStatus[], limit = 30) {
  let query = db.from("olivia_agent_runs").select("*").order("updated_at", { ascending: false }).limit(Math.min(limit, 100));
  if (statuses?.length) query = query.in("status", statuses);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as OliviaAgentRun[];
}

export async function transitionAgentRun(db: SupabaseClient, id: string, to: AgentRunStatus, patch: Record<string, unknown> = {}) {
  const current = await db.from("olivia_agent_runs").select("*").eq("id", id).single();
  if (current.error) throw new Error(current.error.message);
  const run = current.data as OliviaAgentRun;
  assertAgentRunTransition(run.status, to);
  const now = new Date().toISOString();
  const update = { ...patch, status: to, updated_at: now,
    ...(to === "running" && !run.started_at ? { started_at: now } : {}),
    ...(["completed", "failed", "canceled"].includes(to) ? { completed_at: now, lease_owner: null, lease_expires_at: null } : {}),
  };
  const result = await db.from("olivia_agent_runs").update(update).eq("id", id).eq("status", run.status).select("*").single();
  if (result.error) throw new Error(result.error.message);
  await appendAgentRunEvent(db, id, `run_${to}`, "Agent Run 상태가 변경됐어요.", { from: run.status, to });
  return result.data as OliviaAgentRun;
}

export async function claimAgentRuns(db: SupabaseClient, workerId: string, batchSize = 3) {
  const { data, error } = await db.rpc("claim_olivia_agent_runs", { worker_id: workerId, batch_size: batchSize, lease_seconds: 60 });
  if (error) throw new Error(error.message);
  return (data ?? []) as OliviaAgentRun[];
}

export async function resumeAgentRunsForApproval(db:SupabaseClient,approvalId:string){
  const {data,error}=await db.from("olivia_agent_runs").select("id,status").eq("status","waiting_approval").contains("metadata",{approvalId});
  if(error) throw new Error(error.message);
  const resumed=[];
  for(const row of data??[]) resumed.push(await transitionAgentRun(db,String(row.id),"running",{lease_owner:null,lease_expires_at:new Date().toISOString()}));
  return resumed;
}
