import type { PortraitConsentLink } from "@/lib/portraitConsent";

type SupabaseAdmin = ReturnType<typeof import("@/lib/supabase").getSupabaseAdmin>;

export async function validatePortraitConsentLink(
  db: SupabaseAdmin,
  link: PortraitConsentLink,
): Promise<string | null> {
  if (!link.clientId) return null;

  const { data: client, error: clientError } = await db
    .from("clients")
    .select("id")
    .eq("id", link.clientId)
    .maybeSingle();
  if (clientError) throw new Error(clientError.message);
  if (!client) return "선택한 고객을 찾을 수 없습니다.";

  if (!link.workflowRunId) return null;
  const { data: workflowRun, error: workflowError } = await db
    .from("workflow_runs")
    .select("id, client_id")
    .eq("id", link.workflowRunId)
    .maybeSingle();
  if (workflowError) throw new Error(workflowError.message);
  if (!workflowRun) return "선택한 촬영 건을 찾을 수 없습니다.";
  if (workflowRun.client_id !== link.clientId) return "선택한 촬영 건이 해당 고객의 프로젝트가 아닙니다.";
  return null;
}
