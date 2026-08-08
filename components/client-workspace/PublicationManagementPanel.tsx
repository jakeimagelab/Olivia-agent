"use client";

import { useState } from "react";
import { C } from "@/lib/theme";
import { ALL_PUBLICATION_TYPES, isGenericPublicationType, type PublicationType } from "@/lib/clientWorkspace/publications";
import type { WorkspacePublication } from "@/lib/clientWorkspace/types";
import PublicationRow from "./PublicationRow";

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  let data: any = null;
  try { data = await response.json(); } catch { throw new Error(`요청에 실패했습니다. (${response.status})`); }
  if (!data?.ok) throw new Error(data?.error || `요청에 실패했습니다. (${response.status})`);
  return data;
}

export default function PublicationManagementPanel({
  clientId,
  workflowRunId,
  publications,
  resourceIds,
  onRefresh,
}: {
  clientId: string;
  workflowRunId: string;
  publications: WorkspacePublication[];
  resourceIds: Record<string, string | null>;
  onRefresh: () => void;
}) {
  const [busyType, setBusyType] = useState<PublicationType | null>(null);
  const [error, setError] = useState("");

  const byType = new Map(publications.map((p) => [p.relatedType, p]));

  const relatedIdFor = (type: PublicationType): string | null => {
    if (type === "quote") return resourceIds.quote;
    if (type === "contract") return resourceIds.contract;
    if (type === "conti") return resourceIds.conti;
    if (type === "select_gallery") return resourceIds.select_gallery;
    // RAW 다운로드/1차 보정본/최종사진은 아직 전용 엔티티가 없어 프로젝트 단위로 1건만 관리한다.
    return workflowRunId;
  };

  const handlePublish = async (type: PublicationType) => {
    const relatedId = relatedIdFor(type);
    if (!relatedId) {
      setError(type === "quote" ? "먼저 견적서를 작성해주세요." : type === "contract" ? "먼저 계약서를 작성해주세요." : "먼저 콘티를 작성해주세요.");
      return;
    }
    setBusyType(type);
    setError("");
    try {
      if (type === "quote") await fetchJson(`/api/quotes/${relatedId}/publish`, { method: "POST" });
      else if (type === "contract") await fetchJson(`/api/contracts/${relatedId}/publish`, { method: "POST" });
      else await fetchJson(`/api/publications/${type}/${relatedId}/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, workflowRunId }),
      });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공개 처리에 실패했습니다.");
    } finally {
      setBusyType(null);
    }
  };

  const handleRevoke = async (type: PublicationType, publicationId: string) => {
    setBusyType(type);
    setError("");
    try {
      await fetchJson(`/api/publications/${publicationId}/revoke`, { method: "POST" });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공개 중지에 실패했습니다.");
    } finally {
      setBusyType(null);
    }
  };

  return (
    <div className="pc-card pc-card--padded">
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>공개 관리</div>
        <p style={{ fontSize: 11, color: C.muted, margin: "3px 0 0" }}>고객에게 공개할 항목을 관리하세요.</p>
      </div>
      {error ? <p style={{ fontSize: 11.5, color: C.danger, marginBottom: 6 }}>{error}</p> : null}
      <div>
        {ALL_PUBLICATION_TYPES.map((type) => {
          const pub = byType.get(type);
          return (
            <PublicationRow
              key={type}
              type={type}
              publication={pub}
              busy={busyType === type}
              onPublish={() => void handlePublish(type)}
              onRevoke={() => pub && void handleRevoke(type, pub.id)}
            />
          );
        })}
      </div>
      <p style={{ fontSize: 10, color: C.hint, marginTop: 10 }}>공개 항목은 고객 포털에 자동으로 반영됩니다.</p>
    </div>
  );
}
