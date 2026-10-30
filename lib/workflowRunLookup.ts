import type { SupabaseClient } from "@supabase/supabase-js";

// 고객의 "활성" workflow_run 1건을 찾는다 — quote/contract/conti 저장 API가 요청에
// workflowRunId가 명시되지 않았을 때 clientId만으로 어느 프로젝트에 연결할지 추론하기
// 위해 쓴다. 활성 프로젝트가 없으면(예: 고객 등록 전에 견적만 먼저 만드는 경우) null을
// 반환한다 — 호출부는 이를 에러로 취급하지 않는다.
export async function findActiveWorkflowRunId(
  db: SupabaseClient,
  clientId: string | null
): Promise<string | null> {
  if (!clientId) return null;
  const { data } = await db
    .from("workflow_runs")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// 요청 바디의 workflowRunId는 브라우저에 남은 오래된 문맥일 수 있으므로 실제 행이 있는지와
// 고객 일치 여부를 확인한다. 유효하지 않으면 해당 고객의 최신 활성 촬영 건으로 다시 찾고,
// 고객도 없으면 null을 반환해 문서 자체는 촬영 건 연결 없이 안전하게 저장한다.
export async function resolveWorkflowRunId(
  db: SupabaseClient,
  requestedWorkflowRunId: unknown,
  clientId: string | null
): Promise<string | null> {
  if (typeof requestedWorkflowRunId === "string" && requestedWorkflowRunId.trim()) {
    const requestedId = requestedWorkflowRunId.trim();
    const { data, error } = await db
      .from("workflow_runs")
      .select("id, client_id")
      .eq("id", requestedId)
      .maybeSingle();

    if (!error && data?.id && (!clientId || !data.client_id || data.client_id === clientId)) {
      return data.id;
    }

    console.warn("[workflowRunLookup] 유효하지 않은 workflowRunId를 무시합니다.", {
      requestedWorkflowRunId: requestedId,
      clientId,
      reason: error?.message ?? (data?.client_id && clientId && data.client_id !== clientId ? "client_mismatch" : "not_found"),
    });
  }
  return findActiveWorkflowRunId(db, clientId);
}
