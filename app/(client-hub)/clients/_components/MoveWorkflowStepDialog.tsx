"use client";

import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { ACTIVE_WORKFLOW_STEPS, type ActiveWorkflowStepKey } from "@/lib/workflow";
import { C, R } from "@/lib/theme";

type Props = {
  clientName: string;
  workflowRunId: string;
  currentStepKey: ActiveWorkflowStepKey;
  onClose: () => void;
  onMoved: () => void;
};

export default function MoveWorkflowStepDialog({ clientName, workflowRunId, currentStepKey, onClose, onMoved }: Props) {
  const [selected, setSelected] = useState<ActiveWorkflowStepKey | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/workflow-runs/${workflowRunId}/move-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStepKey: selected, reason }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "단계 이동에 실패했습니다.");
      onMoved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "단계 이동에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pcrm-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="pcrm-project-dialog" style={{ maxWidth: 440 }}>
        <header>
          <div><span>PCRM · WORKFLOW</span><h2>단계 이동</h2><p>{clientName} — 목표 단계를 골라 한 번에 이동합니다. 중간 단계를 하나씩 거치지 않아요.</p></div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div style={{ padding: "4px 24px 8px", display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
          {ACTIVE_WORKFLOW_STEPS.map((step, index) => {
            const isCurrent = step.key === currentStepKey;
            const isSelected = step.key === selected;
            return (
              <button
                key={step.key}
                type="button"
                disabled={isCurrent}
                onClick={() => setSelected(step.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                  height: 42, padding: "0 12px", borderRadius: R.sm, font: "inherit", fontSize: 12.5, fontWeight: 700,
                  border: `1px solid ${isSelected ? C.teal : C.border}`,
                  background: isCurrent ? "rgba(21,88,85,.06)" : isSelected ? "rgba(21,88,85,.08)" : C.white,
                  color: isCurrent ? C.hint : isSelected ? C.teal : C.ink,
                  cursor: isCurrent ? "default" : "pointer",
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                  fontSize: 10, fontWeight: 800,
                  background: isSelected ? C.teal : isCurrent ? C.hint : "rgba(21,88,85,.1)",
                  color: isSelected || isCurrent ? "#fff" : C.teal,
                }}>{index + 1}</span>
                <span style={{ flex: 1 }}>{step.name}</span>
                {isCurrent && <span style={{ fontSize: 10.5, color: C.hint, fontWeight: 700 }}>현재 단계</span>}
                {isSelected && <Check size={14} color={C.teal} />}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "8px 24px 0" }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>
            이동 사유 (선택)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 화면 밖에서 이미 촬영·납품까지 끝난 프로젝트라 소급 반영"
              rows={2}
              maxLength={500}
              style={{ width: "100%", marginTop: 6, border: `1px solid ${C.border}`, borderRadius: R.sm, padding: 10, background: C.white, color: C.ink, font: "inherit", fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
            />
          </label>
        </div>

        {error && <p className="pcrm-dialog-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>취소</button>
          <button type="button" onClick={submit} disabled={!selected || saving}>{saving ? "이동 중..." : "이동"}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
