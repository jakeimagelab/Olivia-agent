"use client";

import { useState } from "react";
import Link from "next/link";
import { C } from "@/lib/theme";
import type { ClientWorkspaceNextAction } from "@/lib/clientWorkspace/nextAction";
import { publishPublicationType, relatedIdForPublicationType } from "@/lib/clientWorkspace/publishActions";
import type { PublicationType } from "@/lib/clientWorkspace/publications";
import NextActionCard from "@/components/NextActionCard";

// 고객관리 2열 단순화(2026-08-09) — "다음 할 일"을 화면에서 가장 크게 보여주는 히어로.
// legacy_card 분기는 기존 NextActionCard를 그대로 감싸서 쓴다 — 구 8탭 DetailView도
// 같은 컴포넌트를 쓰고 있어서 NextActionCard 자체는 절대 수정하지 않는다.
export default function NextActionHero({
  client,
  activeProject,
  nextAction,
  stepIcon,
  stepDescription,
  clientId,
  workflowRunId,
  resourceIds,
  onRefresh,
  onPreviewPublication,
}: {
  client: Record<string, any>;
  activeProject: Record<string, any>;
  nextAction: ClientWorkspaceNextAction;
  stepIcon?: string;
  stepDescription?: string;
  clientId: string;
  workflowRunId: string;
  resourceIds: Record<string, string | null>;
  onRefresh: () => void;
  onPreviewPublication?: (relatedType: string, relatedId: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (nextAction.kind === "none") return null;

  if (nextAction.kind === "legacy_card") {
    return (
      <div className="pcrm-next-action-hero">
        <NextActionCard client={client} workflowRun={activeProject} stepIcon={stepIcon} stepDescription={stepDescription} onRefresh={onRefresh} />
      </div>
    );
  }

  if (nextAction.kind === "tool_link") {
    return (
      <div className="pcrm-next-action-hero">
        <div className="pcrm-current-step-card">
          <div className="pcrm-current-step-card__left">
            <div className="pcrm-current-step-card__icon">{stepIcon || "🟠"}</div>
            <div className="pcrm-current-step-card__body">
              <span className="pcrm-current-step-card__label">다음 할 일</span>
              <h2 className="pcrm-current-step-card__title">{nextAction.title}</h2>
              <p className="pcrm-current-step-card__desc">{stepDescription}</p>
            </div>
          </div>
          <div className="pcrm-current-step-card__actions">
            <Link href={nextAction.ctaHref} className="pc-btn pc-btn--orange pc-btn--sm">{nextAction.title} →</Link>
          </div>
        </div>
      </div>
    );
  }

  // publish_pending
  const relatedType = nextAction.relatedType as PublicationType;
  const relatedId = relatedIdForPublicationType(relatedType, resourceIds, workflowRunId);

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      await publishPublicationType({ type: relatedType, clientId, workflowRunId, resourceIds });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공개 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pcrm-next-action-hero">
      <div className="pcrm-current-step-card" style={{ background: "#fff", border: `1.5px solid ${C.orange}` }}>
        <div className="pcrm-current-step-card__left">
          <div className="pcrm-current-step-card__icon">📢</div>
          <div className="pcrm-current-step-card__body">
            <span className="pcrm-current-step-card__label">다음 할 일</span>
            <h2 className="pcrm-current-step-card__title">{nextAction.title}</h2>
            <p className="pcrm-current-step-card__desc">{nextAction.description}</p>
            {error ? <p style={{ margin: "3px 0 0", color: C.danger, fontSize: 11, fontWeight: 800 }}>{error}</p> : null}
          </div>
        </div>
        <div className="pcrm-current-step-card__actions">
          <button
            type="button"
            className="pc-btn pc-btn--secondary pc-btn--sm"
            onClick={() => onPreviewPublication?.(nextAction.relatedType, relatedId)}
          >
            미리보기
          </button>
          <button type="button" className="pc-btn pc-btn--orange pc-btn--sm" disabled={busy} onClick={publish}>
            {busy ? "처리 중..." : "공개하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
