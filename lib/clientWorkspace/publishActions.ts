import { type PublicationType } from "./publications";

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  let data: any = null;
  try { data = await response.json(); } catch { throw new Error(`요청에 실패했습니다. (${response.status})`); }
  if (!data?.ok) throw new Error(data?.error || `요청에 실패했습니다. (${response.status})`);
  return data;
}

export function relatedIdForPublicationType(
  type: PublicationType,
  resourceIds: Record<string, string | null>,
  workflowRunId: string
): string | null {
  if (type === "quote") return resourceIds.quote;
  if (type === "contract") return resourceIds.contract;
  if (type === "conti") return resourceIds.conti;
  if (type === "select_gallery") return resourceIds.select_gallery;
  // RAW 다운로드/1차 보정본/최종사진은 아직 전용 엔티티가 없어 프로젝트 단위로 1건만 관리한다.
  return workflowRunId;
}

export async function publishPublicationType({
  type,
  clientId,
  workflowRunId,
  resourceIds,
}: {
  type: PublicationType;
  clientId: string;
  workflowRunId: string;
  resourceIds: Record<string, string | null>;
}): Promise<void> {
  const relatedId = relatedIdForPublicationType(type, resourceIds, workflowRunId);
  if (!relatedId) {
    throw new Error(
      type === "quote" ? "먼저 견적서를 작성해주세요." : type === "contract" ? "먼저 계약서를 작성해주세요." : "먼저 콘티를 작성해주세요."
    );
  }
  if (type === "quote") await fetchJson(`/api/quotes/${relatedId}/publish`, { method: "POST" });
  else if (type === "contract") await fetchJson(`/api/contracts/${relatedId}/publish`, { method: "POST" });
  else await fetchJson(`/api/publications/by-type/${type}/${relatedId}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, workflowRunId }),
  });
}

export async function revokePublication(publicationId: string): Promise<void> {
  await fetchJson(`/api/publications/${publicationId}/revoke`, { method: "POST" });
}
