"use client";

import { useState } from "react";
import { C } from "@/lib/theme";
import { ALL_PUBLICATION_TYPES, type PublicationType } from "@/lib/clientWorkspace/publications";
import type { WorkspacePublication } from "@/lib/clientWorkspace/types";
import { publishPublicationType, revokePublication } from "@/lib/clientWorkspace/publishActions";
import PublicationRow from "./PublicationRow";

// 고객관리 3열 복귀(2026-08-10) — 7개 공개 항목을 항상 전부 보여준다(2열 때의 "공개 대기만"
// 방식과 다름). quote 타입의 "공개"만 Workspace Modal을 열고(발행 전 미리보기 확인),
// 나머지 6개 타입은 기존처럼 즉시 발행 API를 호출한다.
export default function PublicationManagementPanel({
  clientId,
  workflowRunId,
  publications,
  resourceIds,
  onRefresh,
  onOpenQuoteModal,
}: {
  clientId: string;
  workflowRunId: string;
  publications: WorkspacePublication[];
  resourceIds: Record<string, string | null>;
  onRefresh: () => void;
  onOpenQuoteModal: () => void;
}) {
  const [busyType, setBusyType] = useState<PublicationType | null>(null);
  const [error, setError] = useState("");

  const byType = new Map(publications.map((p) => [p.relatedType, p]));

  const handlePublish = async (type: PublicationType) => {
    if (type === "quote") {
      onOpenQuoteModal();
      return;
    }
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

  const handleRevoke = async (type: PublicationType, publicationId: string) => {
    setBusyType(type);
    setError("");
    try {
      await revokePublication(publicationId);
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
