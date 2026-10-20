import type { SupabaseClient } from "@supabase/supabase-js";

export type ClassificationPortalAccess = {
  connected: boolean;
  approved: boolean;
  pending: boolean;
};

export async function getClassificationPortalAccess(
  db: SupabaseClient,
  workflowRunId: string | null | undefined,
  clientId?: string | null,
): Promise<ClassificationPortalAccess> {
  let resolvedWorkflowRunId = workflowRunId ?? null;
  if (!resolvedWorkflowRunId && clientId) {
    const { data: workflowRun, error: workflowError } = await db
      .from("workflow_runs")
      .select("id")
      .eq("client_id", clientId)
      .neq("status", "canceled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (workflowError) throw workflowError;
    resolvedWorkflowRunId = workflowRun?.id ?? null;
  }
  if (!resolvedWorkflowRunId) return { connected: false, approved: true, pending: false };

  const { data, error } = await db
    .from("photo_storage_projects")
    .select("id,classify_approved_at")
    .eq("workflow_run_id", resolvedWorkflowRunId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { connected: false, approved: true, pending: false };

  const approved = Boolean(data.classify_approved_at);
  return { connected: true, approved, pending: !approved };
}
