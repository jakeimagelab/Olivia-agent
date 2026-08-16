"use client";

import Link from "next/link";
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
}: {
  client: { id: string; name: string };
  workflowRun: any;
  stepIcon?: string;
  stepDescription?: string;
  onOpenToolModal?: (stepKey: "quote" | "contract" | "conti") => void;
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
          {isModalStep && onOpenToolModal ? (
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
