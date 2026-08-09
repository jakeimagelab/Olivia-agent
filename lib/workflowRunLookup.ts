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

// 요청 바디에 workflowRunId가 이미 있으면 그걸 쓰고, 없으면 findActiveWorkflowRunId로 조회한다.
export async function resolveWorkflowRunId(
  db: SupabaseClient,
  requestedWorkflowRunId: unknown,
  clientId: string | null
): Promise<string | null> {
  if (typeof requestedWorkflowRunId === "string" && requestedWorkflowRunId) return requestedWorkflowRunId;
  return findActiveWorkflowRunId(db, clientId);
}
