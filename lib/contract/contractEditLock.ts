import type { SupabaseClient } from "@supabase/supabase-js";

export async function getContractEditLock(
  db: SupabaseClient,
  contract: { id: string; status?: unknown; workflow_run_id?: unknown },
): Promise<string | null> {
  if (contract.status === "final") return "최종완료된 계약서입니다.";
  if (!contract.workflow_run_id) return null;
  const { data, error } = await db.from("pcrm_publications").select("id")
    .eq("workflow_run_id", contract.workflow_run_id)
    .eq("related_type", "contract")
    .eq("related_id", contract.id)
    .in("status", ["approved", "completed"])
    .limit(1).maybeSingle();
  if (error) throw error;
  return data ? "고객 확인이 끝난 계약서입니다." : null;
}
