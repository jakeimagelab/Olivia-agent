"use client";

import { Check } from "lucide-react";
import { C } from "@/lib/theme";
import { ACTIVE_WORKFLOW_STEPS, getWorkflowDisplayStepKey } from "@/lib/workflow";

interface Props {
  currentStepKey: string;
  selectedStepKey?: string;
  checks?: unknown;
  workflowStatus?: string | null;
  onSelect?: (key: string) => void;
}

const SHORT_LABELS: Record<string, string> = {
  quote: "견적", contract: "계약", conti: "콘티", shooting: "촬영",
  payment_confirm: "잔금", backup_sorting: "백업", client_selection: "셀렉",
  raw_matching: "RAW", retouching: "보정", final_delivery: "전달",
  revision: "수정", reward: "리워드",
};

/** 과거 키는 보존하되 화면에는 실제 진행 12단계만 보여준다. */
export default function WorkflowBar({ currentStepKey, selectedStepKey, workflowStatus, onSelect }: Props) {
  const displayKey = getWorkflowDisplayStepKey(currentStepKey) ?? ACTIVE_WORKFLOW_STEPS[0].key;
  const currentIndex = ACTIVE_WORKFLOW_STEPS.findIndex((step) => step.key === displayKey);
  const completed = workflowStatus === "completed";
  return (
    <div aria-label={`진행 ${completed ? 12 : currentIndex + 1} / ${ACTIVE_WORKFLOW_STEPS.length}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${ACTIVE_WORKFLOW_STEPS.length}, minmax(18px, 1fr))`, gap: 3 }}>
        {ACTIVE_WORKFLOW_STEPS.map((step, index) => {
          const done = completed || index < currentIndex;
          const active = !completed && index === currentIndex;
          const selected = selectedStepKey === step.key;
          return (
            <button key={step.key} type="button" title={step.name} aria-label={step.name} onClick={() => onSelect?.(step.key)} style={{ height: 22, minWidth: 18, display: "grid", placeItems: "center", padding: 0, border: selected ? `1px solid ${C.orange}` : 0, borderRadius: 4, background: done ? C.teal : active ? C.orange : "#E7ECEA", color: done || active ? "#fff" : C.hint, cursor: onSelect ? "pointer" : "default", fontSize: 8, fontWeight: 600 }}>
              {done ? <Check size={10} strokeWidth={2} /> : SHORT_LABELS[step.key]}
            </button>
          );
        })}
      </div>
      <strong style={{ color: completed ? C.hint : C.teal, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{completed ? ACTIVE_WORKFLOW_STEPS.length : currentIndex + 1} / {ACTIVE_WORKFLOW_STEPS.length}</strong>
    </div>
  );
}
