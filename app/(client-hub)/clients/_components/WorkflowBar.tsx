"use client";

import { Check } from "lucide-react";
import { ACTIVE_WORKFLOW_STEPS, getWorkflowDisplayStepKey } from "@/lib/workflow";
import { C } from "@/lib/theme";

const SHORT: Record<string, string> = {
  consult_meeting: "상담",   quote: "견적서",     contract: "계약서",
  conti: "콘티",             shooting: "촬영",    backup_sorting: "백업",
  payment_confirm: "잔금",   client_selection: "셀렉", raw_matching: "RAW 승인",
  original_delivery: "원본", retouching: "보정",  revision: "수정",
  final_delivery: "최종",    review_content: "후기", reward: "리워드",
  customer_care: "고객관리", content_planning: "기획",
};

interface Props {
  currentStepKey: string;
  selectedStepKey: string;
  onSelect: (key: string) => void;
}

export default function WorkflowBar({ currentStepKey, selectedStepKey, onSelect }: Props) {
  const displayCurrentKey = getWorkflowDisplayStepKey(currentStepKey) ?? ACTIVE_WORKFLOW_STEPS[0].key;
  const displaySelectedKey = getWorkflowDisplayStepKey(selectedStepKey) ?? displayCurrentKey;
  const currentIdx = ACTIVE_WORKFLOW_STEPS.findIndex((s) => s.key === displayCurrentKey);

  return (
    <div style={{ overflowX: "auto", padding: "0 0 4px" }}>
      <div style={{ display: "flex", gap: 4, minWidth: "max-content", padding: "2px" }}>
        {ACTIVE_WORKFLOW_STEPS.map((step, idx) => {
          const isCurrent = step.key === displayCurrentKey;
          const isSelected = step.key === displaySelectedKey && !isCurrent;
          const isDone = idx < currentIdx;

          let bg: string = C.white;
          let borderColor: string = C.border;
          let textColor: string = C.hint;

          if (isCurrent) {
            bg = C.teal; borderColor = C.teal; textColor = "#fff";
          } else if (isSelected) {
            bg = C.light; borderColor = C.green; textColor = C.green;
          } else if (isDone) {
            bg = "#F0F9F8"; borderColor = "rgba(21,88,85,.2)"; textColor = C.green;
          }

          return (
            <button
              key={step.key}
              onClick={() => onSelect(step.key)}
              title={step.name}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                padding: "8px 11px", minWidth: 60,
                border: `1.5px solid ${borderColor}`, borderRadius: 10,
                background: bg, cursor: "pointer", fontFamily: "inherit",
                transition: "all .12s",
              }}
            >
              <span style={{ minHeight: 14, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600, color: textColor }}>
                {isDone && !isCurrent ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : idx + 1}
              </span>
              <span style={{ fontSize: 11, fontWeight: isCurrent ? 600 : 500, color: textColor, whiteSpace: "nowrap" }}>
                {SHORT[step.key] ?? step.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
