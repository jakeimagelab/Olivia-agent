"use client";

import { useState } from "react";
import { C, R } from "@/lib/theme";
import { DISPLAY_STATUS_LABEL, PUBLICATION_TYPE_LABEL, type PublicationType } from "@/lib/clientWorkspace/publications";
import type { WorkspacePublication } from "@/lib/clientWorkspace/types";
import { publishPublicationType } from "@/lib/clientWorkspace/publishActions";

// 고객관리 2열 단순화(2026-08-09) — 이미 공개된 자료는 여기 안 보여준다(공개 이력 모달에서만).
export default function PendingPublicationsList({
  clientId,
  workflowRunId,
  publications,
  resourceIds,
  onRefresh,
  onViewAll,
  onPreview,
}: {
  clientId: string;
  workflowRunId: string;
  publications: WorkspacePublication[];
  resourceIds: Record<string, string | null>;
  onRefresh: () => void;
  onViewAll: () => void;
  onPreview: (relatedType: string, relatedId: string | null) => void;
}) {
  const [busyType, setBusyType] = useState<PublicationType | null>(null);
  const [error, setError] = useState("");

  const pending = publications.filter((p) => p.displayStatus === "pending_publish");

  const handlePublish = async (pub: WorkspacePublication) => {
    const type = pub.relatedType as PublicationType;
    setBusyType(type);
    setError("");
    try {
      await publishPublicationType({ type, clientId, workflowRunId, resourceIds });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공개 처리에 실패했습니다.");
    } finally {
      setBusyType(null);
    }
  };

  if (pending.length === 0) {
    return (
      <div className="pc-card pc-card--padded">
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 4 }}>고객 공개 대기</div>
        <p style={{ fontSize: 11.5, color: C.hint, margin: 0 }}>✓ 현재 공개 대기 중인 자료가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="pc-card pc-card--padded">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>고객 공개 대기 {pending.length}건</span>
        <button type="button" onClick={onViewAll} style={{ border: "none", background: "none", color: C.teal, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>모두 보기</button>
      </div>
      {error ? <p style={{ fontSize: 11.5, color: C.danger, marginBottom: 6 }}>{error}</p> : null}
      <div>
        {pending.map((pub) => {
          const type = pub.relatedType as PublicationType;
          const busy = busyType === type;
          return (
            <div key={pub.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{PUBLICATION_TYPE_LABEL[type] ?? pub.relatedType}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.orange }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: C.orange }}>{DISPLAY_STATUS_LABEL.pending_publish}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => onPreview(pub.relatedType, pub.relatedId)} className="pc-btn pc-btn--secondary pc-btn--sm">미리보기</button>
                <button type="button" disabled={busy} onClick={() => void handlePublish(pub)} className="pc-btn pc-btn--orange pc-btn--sm">
                  {busy ? "처리 중..." : "공개"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
