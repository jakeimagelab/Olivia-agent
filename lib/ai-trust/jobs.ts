import type { SupabaseClient } from "@supabase/supabase-js";

export type AiTrustJobType = "ai_query" | "clinic_sync" | "extract" | "score" | "retention";

export function aiQueryJobKey(runId: string, promptId: string, provider: string, runNumber: number) {
  return `ai_query:${runId}:${promptId}:${provider}:${runNumber}`;
}

export function retryDelayMs(attempts: number) {
  if (attempts <= 1) return 60_000;
  if (attempts === 2) return 5 * 60_000;
  return 30 * 60_000;
}

export async function enqueueAiTrustJobs(supabase: SupabaseClient, rows: Array<{
  project_id?: string | null;
  run_id?: string | null;
  audit_request_id?: string | null;
  job_type: AiTrustJobType;
  idempotency_key: string;
  payload?: Record<string, unknown>;
}>) {
  if (!rows.length) return { data: [], error: null };
  return supabase.from("ai_trust_jobs").upsert(rows.map((row) => ({ ...row, payload: row.payload || {} })), {
    onConflict: "idempotency_key",
    ignoreDuplicates: true,
  }).select("id, idempotency_key");
}

export async function refreshAiTrustRunProgress(supabase: SupabaseClient, runId: string) {
  const { data: rows, error } = await supabase.from("ai_trust_audit_requests").select("status").eq("run_id", runId);
  if (error) throw error;
  const completed = (rows || []).filter((row) => row.status === "COMPLETED").length;
  const failed = (rows || []).filter((row) => row.status === "FAILED").length;
  const pending = (rows || []).filter((row) => ["PENDING", "RUNNING"].includes(row.status)).length;
  const patch: Record<string, unknown> = { completed_requests: completed, failed_requests: failed };
  if (pending === 0) {
    patch.status = failed > 0 ? "FAILED" : "COMPLETED";
    patch.completed_at = new Date().toISOString();
  }
  await supabase.from("ai_trust_audit_runs").update(patch).eq("id", runId);
  return { completed, failed, pending, status: patch.status as string | undefined };
}
