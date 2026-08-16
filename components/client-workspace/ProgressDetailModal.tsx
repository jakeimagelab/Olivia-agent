"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { ACTIVE_WORKFLOW_STEPS, getWorkflowDisplayStepKey } from "@/lib/workflow";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { tryMoveWorkflowStep } from "@/lib/clientWorkspace/stepNavigation";
import { C, R } from "@/lib/theme";

const MODAL_TOOL_STEPS = new Set(["quote", "contract", "conti"]);

// 고객관리 2열 단순화(2026-08-09) — 메인 화면은 컴팩트 진행바만 보여주고,
// "전체 과정 보기" 클릭 시 여기서 12단계 전체를 보여준다.
// 코드 요청서 4차(2026-08-16) — 표시 전용에서 클릭 가능한 목록으로 바꿨다. 어느 단계를
// 클릭하든(과거/현재/미래 무관) 즉시 그 단계로 이동을 시도하고(문서 없는 quote/contract/conti는
// 조용히 막힘, tryMoveWorkflowStep 참고), 결과와 무관하게 그 화면을 바로 연다 — ⋮ 메뉴의
// "단계 이동"(MoveWorkflowStepDialog)이 하던 일을 이 목록이 흡수했다.
export default function ProgressDetailModal({
  open,
  onClose,
  client,
  workflowRun,
  onOpenToolModal,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  client: { id: string; name?: string };
  workflowRun: { id: string; current_step_key: string } | null;
  onOpenToolModal: (stepKey: "quote" | "contract" | "conti") => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  if (!open || !workflowRun) return null;
  if (typeof document === "undefined") return null;

  const displayStepKey = getWorkflowDisplayStepKey(workflowRun.current_step_key) || workflowRun.current_step_key;

  const handleSelect = async (stepKey: string) => {
    onClose();
    await tryMoveWorkflowStep(workflowRun.id, stepKey);
    onRefresh();
    if (MODAL_TOOL_STEPS.has(stepKey)) {
      onOpenToolModal(stepKey as "quote" | "contract" | "conti");
    } else {
      router.push(buildStepAppLink({ stepKey, clientId: client.id, workflowRunId: workflowRun.id }));
    }
  };

  return createPortal(
    <div className="pcrm-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="pcrm-project-dialog" style={{ maxWidth: 440 }}>
        <header>
          <div><span>PCRM · WORKFLOW</span><h2>전체 진행 상황</h2><p>단계를 클릭하면 바로 그 처리 화면으로 들어갑니다.</p></div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div style={{ padding: "4px 24px 20px", display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" }}>
          {ACTIVE_WORKFLOW_STEPS.map((step, index) => {
            const isCurrent = step.key === displayStepKey;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => void handleSelect(step.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                  height: 42, padding: "0 12px", borderRadius: R.sm, font: "inherit", fontSize: 12.5, fontWeight: 700,
                  border: `1px solid ${isCurrent ? C.teal : C.border}`,
                  background: isCurrent ? "rgba(21,88,85,.08)" : C.white,
                  color: isCurrent ? C.teal : C.ink,
                  cursor: "pointer",
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                  fontSize: 10, fontWeight: 800,
                  background: isCurrent ? C.teal : "rgba(21,88,85,.1)",
                  color: isCurrent ? "#fff" : C.teal,
                }}>{index + 1}</span>
                <span style={{ flex: 1 }}>{step.name}</span>
                {isCurrent && <><span style={{ fontSize: 10.5, color: C.muted, fontWeight: 700 }}>현재 단계</span><Check size={14} color={C.teal} /></>}
              </button>
            );
          })}
        </div>

        <footer>
          <button type="button" onClick={onClose}>닫기</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
