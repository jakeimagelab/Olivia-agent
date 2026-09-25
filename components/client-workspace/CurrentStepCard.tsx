"use client";

import Link from "next/link";
import { useState } from "react";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { getWorkflowDisplayStepKey, STEP_NAME, type ToolOnlyStepKey } from "@/lib/workflow";

const MODAL_TOOL_STEPS = new Set<ToolOnlyStepKey>(["quote", "contract", "conti"]);

// 코드 요청서 4차(2026-08-16) — NextActionCard(체크리스트/승인대기/더보기 메뉴)를 걷어내고
// "현재 단계 표시 + 관련 앱 열기" 하나만 남긴 단순 카드. 견적/계약/콘티든 그 외 단계든
// 동일한 패턴으로 취급한다 — 단계별로 다른 UI를 그리지 않는다.
export default function CurrentStepCard({
  client,
  workflowRun,
  stepIcon,
  stepDescription,
  onOpenToolModal,
  onRefresh,
}: {
  client: Record<string, any>;
  workflowRun: any;
  stepIcon?: string;
  stepDescription?: string;
  onOpenToolModal?: (stepKey: "quote" | "contract" | "conti") => void;
  onRefresh?: () => void;
}) {
  if (!workflowRun?.id) {
    return (
      <section className="pcrm-current-step-card">
        <div className="pcrm-current-step-card__left">
          <div className="pcrm-current-step-card__body">
            <span className="pcrm-current-step-card__label">현재 단계</span>
            <h2 className="pcrm-current-step-card__title">{client.name}</h2>
            <p className="pcrm-current-step-card__desc">진행 중인 워크플로우가 없습니다.</p>
          </div>
        </div>
      </section>
    );
  }

  const isCompleted = workflowRun.status === "completed";
  const stepKey = getWorkflowDisplayStepKey(workflowRun.current_step_key) || workflowRun.current_step_key;
  const stepName = STEP_NAME[stepKey] || stepKey;
  const appHref = buildStepAppLink({ stepKey, clientId: client.id, workflowRunId: workflowRun.id });
  const isModalStep = MODAL_TOOL_STEPS.has(stepKey);
  // payment_confirm은 STEP_APP_LINKS에 연결된 앱이 없다 — 계좌 API 연동 전까지는 대표가
  // 입금 확인 후 수동으로 누르는 버튼 하나가 전부다(PHASE 3, 2026-09-25 작업 1-B).
  const isPaymentConfirmStep = stepKey === "payment_confirm";

  return (
    <section className="pcrm-current-step-card">
      <div className="pcrm-current-step-card__left">
        <div className="pcrm-current-step-card__icon">{stepIcon || "🟠"}</div>
        <div className="pcrm-current-step-card__body">
          <span className="pcrm-current-step-card__label">현재 단계</span>
          <h2 className="pcrm-current-step-card__title">{isCompleted ? "모든 단계 완료" : stepName}</h2>
          <p className="pcrm-current-step-card__desc">{isCompleted ? "워크플로우의 모든 단계가 완료되었습니다." : stepDescription}</p>
        </div>
      </div>
      {!isCompleted && (
        <div className="pcrm-current-step-card__actions">
          {isPaymentConfirmStep ? (
            <PaymentConfirmAction workflowRunId={workflowRun.id} onRefresh={onRefresh} />
          ) : isModalStep && onOpenToolModal ? (
            <button type="button" onClick={() => onOpenToolModal(stepKey as "quote" | "contract" | "conti")} className="pc-btn pc-btn--orange pc-btn--sm">
              관련 앱 열기
            </button>
          ) : (
            <Link href={appHref} className="pc-btn pc-btn--orange pc-btn--sm">관련 앱 열기</Link>
          )}
        </div>
      )}
    </section>
  );
}

function PaymentConfirmAction({ workflowRunId, onRefresh }: { workflowRunId: string; onRefresh?: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/workflow-runs/${workflowRunId}/complete-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepKey: "payment_confirm" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "잔금·계산서 확인 처리에 실패했습니다.");
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "잔금·계산서 확인 처리에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button type="button" onClick={confirm} disabled={submitting} className="pc-btn pc-btn--orange pc-btn--sm">
        {submitting ? "처리 중..." : "잔금·계산서 확인 완료"}
      </button>
      {error && <span style={{ fontSize: 11, color: "#DC2626" }}>{error}</span>}
    </div>
  );
}
