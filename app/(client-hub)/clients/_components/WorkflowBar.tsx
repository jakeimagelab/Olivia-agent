"use client";

import { WORKFLOW_STEPS } from "@/lib/workflow";

const C = {
  teal: "#155855", green: "#22876A", white: "#FFFFFF",
  border: "rgba(21,88,85,.12)", muted: "#5A7470", hint: "#9BB5B0", light: "#EAF4F2",
};

const SHORT: Record<string, string> = {
  consult_meeting: "상담",   quote: "견적서",     contract: "계약서",
  conti: "콘티",             shooting: "촬영",    backup_sorting: "백업",
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
  const currentIdx = WORKFLOW_STEPS.findIndex((s) => s.key === currentStepKey);

  return (
    <div style={{ overflowX: "auto", padding: "0 0 4px" }}>
      <div style={{ display: "flex", gap: 4, minWidth: "max-content", padding: "2px" }}>
        {WORKFLOW_STEPS.map((step, idx) => {
          const isCurrent = step.key === currentStepKey;
          const isSelected = step.key === selectedStepKey && !isCurrent;
          const isDone = idx < currentIdx;

          let bg = C.white;
          let borderColor = C.border;
          let textColor = C.hint;

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
              <span style={{ fontSize: 10, fontWeight: 900, color: textColor }}>
                {isDone && !isCurrent ? "✓" : idx + 1}
              </span>
              <span style={{ fontSize: 11, fontWeight: isCurrent ? 900 : 700, color: textColor, whiteSpace: "nowrap" }}>
                {SHORT[step.key] ?? step.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
