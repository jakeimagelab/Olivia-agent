import type { SupabaseClient } from "@supabase/supabase-js";
import { WORKFLOW_STEPS } from "@/lib/workflow";
import type { OliviaWorkflowContext } from "@/lib/olivia/types";

type QueryResult = { data: any; error: { message: string } | null };

async function optionalQuery(
  source: string,
  query: PromiseLike<QueryResult>,
): Promise<{ source: string; data: any; unavailable: boolean }> {
  try {
    const result = await query;
    return { source, data: result.error ? null : result.data, unavailable: Boolean(result.error) };
  } catch {
    return { source, data: null, unavailable: true };
  }
}

export async function buildWorkflowContext(
  db: SupabaseClient,
  workflowRunId: string,
  now = new Date(),
): Promise<OliviaWorkflowContext> {
  const { data: workflowRun, error: runError } = await db
    .from("workflow_runs")
    .select("*")
    .eq("id", workflowRunId)
    .single();
  if (runError || !workflowRun) throw new Error(runError?.message || "workflow_run not found");

  const clientId = workflowRun.client_id;
  const clientName = workflowRun.client_name || "";
  const queries = [
    optionalQuery("client", clientId
      ? db.from("clients").select("*").eq("id", clientId).maybeSingle()
      : Promise.resolve({ data: null, error: null })),
    optionalQuery("stepRuns", db.from("workflow_step_runs").select("*").eq("workflow_run_id", workflowRunId).order("created_at")),
    optionalQuery("tasks", db.from("agent_tasks").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false })),
    optionalQuery("approvals", db.from("agent_approvals").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false })),
    optionalQuery("mailing", db.from("mailing_queue").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false })),
    optionalQuery("consultationMemos", clientId
      ? db.from("consultation_memos").select("*").eq("hospital_id", clientId).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null })),
    optionalQuery("commitments", db.from("meeting_commitments").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false })),
    optionalQuery("quotes", clientName
      ? db.from("quotes").select("*").eq("hospital_name", clientName).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null })),
    optionalQuery("contracts", clientName
      ? db.from("contracts").select("*").eq("hospital_name", clientName).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null })),
    optionalQuery("galleries", clientId
      ? db.from("galleries").select("*").eq("hospital_id", clientId).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null })),
    optionalQuery("revisions", clientId
      ? db.from("client_revision_requests").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [], error: null })),
    optionalQuery("rewards", clientId
      ? db.from("reward_transactions").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [], error: null })),
    optionalQuery("reviews", clientId
      ? db.from("client_reviews").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null })),
    optionalQuery("recentAgentLogs", db.from("agent_logs").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }).limit(50)),
    optionalQuery("recentEvents", db.from("olivia_events").select("*").eq("workflow_run_id", workflowRunId).order("occurred_at", { ascending: false }).limit(100)),
  ];

  const results = await Promise.all(queries);
  const bySource = Object.fromEntries(results.map((result) => [result.source, result.data]));
  const unavailableSources = results.filter((result) => result.unavailable).map((result) => result.source);

  return {
    workflowRun,
    client: bySource.client ?? null,
    project: workflowRun.project_id || workflowRun.project_name
      ? { id: workflowRun.project_id ?? null, name: workflowRun.project_name ?? "" }
      : null,
    currentStep: WORKFLOW_STEPS.find((step) => step.key === workflowRun.current_step_key) ?? null,
    stepRuns: bySource.stepRuns ?? [],
    tasks: bySource.tasks ?? [],
    approvals: bySource.approvals ?? [],
    mailing: bySource.mailing ?? [],
    consultationMemos: bySource.consultationMemos ?? [],
    commitments: bySource.commitments ?? [],
    quotes: bySource.quotes ?? [],
    contracts: bySource.contracts ?? [],
    galleries: bySource.galleries ?? [],
    revisions: bySource.revisions ?? [],
    rewards: bySource.rewards ?? [],
    reviews: bySource.reviews ?? [],
    recentAgentLogs: bySource.recentAgentLogs ?? [],
    recentEvents: bySource.recentEvents ?? [],
    unavailableSources,
    now: now.toISOString(),
  };
}
