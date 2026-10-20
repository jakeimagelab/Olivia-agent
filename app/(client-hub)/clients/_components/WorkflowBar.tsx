"use client";

import { Check } from "lucide-react";
import { C } from "@/lib/theme";
import { WORKFLOW_CHECKS, effectiveWorkflowChecks, workflowCheckProgress } from "@/lib/workflowChecks";

interface Props {
  currentStepKey: string;
  selectedStepKey?: string;
  checks?: unknown;
  workflowStatus?: string | null;
  onSelect?: (key: string) => void;
}

/** 옛 단계 바 자리를 체크 진행 막대와 완료 수로 줄여 보여준다. */
export default function WorkflowBar({ currentStepKey, checks, workflowStatus, onSelect }: Props) {
  const effective = effectiveWorkflowChecks({ checks, currentStepKey, status: workflowStatus });
  const progress = workflowCheckProgress(effective);
  return (
    <div aria-label={`끝낸 것 ${progress.done} / ${progress.total}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${WORKFLOW_CHECKS.length}, minmax(7px, 1fr))`, gap: 3 }}>
        {WORKFLOW_CHECKS.map((check) => {
          const done = Boolean(effective[check.key]?.done);
          return (
            <button key={check.key} type="button" title={check.label} aria-label={check.label} onClick={() => onSelect?.(check.stepKey)} style={{ height: 16, minWidth: 7, display: "grid", placeItems: "center", padding: 0, border: 0, borderRadius: 3, background: done ? C.teal : "#E7ECEA", color: "#fff", cursor: onSelect ? "pointer" : "default" }}>
              {done ? <Check size={9} strokeWidth={2} /> : null}
            </button>
          );
        })}
      </div>
      <strong style={{ color: C.teal, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{progress.done} / {progress.total}</strong>
    </div>
  );
}
