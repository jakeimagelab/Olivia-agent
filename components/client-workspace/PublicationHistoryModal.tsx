"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { C, R } from "@/lib/theme";
import { DISPLAY_STATUS_LABEL, PUBLICATION_TYPE_LABEL, type PublicationType } from "@/lib/clientWorkspace/publications";
import type { WorkspacePublication } from "@/lib/clientWorkspace/types";
import { revokePublication } from "@/lib/clientWorkspace/publishActions";

// 고객관리 2열 단순화(2026-08-09) — "공개 이력" 모달. 전체 상태(초안/공개대기/공개됨/공개중지)를
// 다 보여준다("전체 이력" 문구에 맞춤) — 공개된 것만 공개 중지 가능.
export default function PublicationHistoryModal({
  open,
  onClose,
  publications,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  workflowRunId: string;
  publications: WorkspacePublication[];
  onRefresh: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const handleRevoke = async (publicationId: string) => {
    setBusyId(publicationId);
    setError("");
    try {
      await revokePublication(publicationId);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공개 중지에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return createPortal(
    <div className="pcrm-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="pcrm-project-dialog">
        <header>
          <div><span>PCRM · PUBLICATIONS</span><h2>공개 이력</h2><p>이 프로젝트의 모든 공개 자료 이력입니다.</p></div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        {error ? <p className="pcrm-dialog-error">{error}</p> : null}

        <div style={{ display: "grid", gap: 2, maxHeight: "50vh", overflowY: "auto" }}>
          {publications.length === 0 ? (
            <p style={{ fontSize: 12, color: C.hint, padding: "16px 0" }}>공개 이력이 없습니다.</p>
          ) : (
            publications.map((pub) => {
              const type = pub.relatedType as PublicationType;
              const label = PUBLICATION_TYPE_LABEL[type] ?? pub.relatedType;
              const busy = busyId === pub.id;
              return (
                <div key={pub.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 4px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{label}</div>
                    <div style={{ fontSize: 10.5, color: C.hint, marginTop: 2 }}>
                      {DISPLAY_STATUS_LABEL[pub.displayStatus]}
                      {pub.publishedAt ? ` · 공개 ${new Date(pub.publishedAt).toLocaleDateString("ko-KR")}` : ""}
                      {pub.revokedAt ? ` · 중지 ${new Date(pub.revokedAt).toLocaleDateString("ko-KR")}` : ""}
                    </div>
                  </div>
                  {pub.displayStatus === "published" ? (
                    <button type="button" disabled={busy} onClick={() => void handleRevoke(pub.id)}
                      style={{ height: 30, padding: "0 12px", flexShrink: 0, borderRadius: R.sm, border: `1px solid ${C.danger}`, background: "#FEF2F2", color: C.danger, fontSize: 11, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer" }}>
                      {busy ? "처리 중..." : "공개 중지"}
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <footer>
          <button type="button" onClick={onClose}>닫기</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
