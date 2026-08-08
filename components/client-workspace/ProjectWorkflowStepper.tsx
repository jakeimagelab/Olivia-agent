"use client";

import { Check } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { WorkspacePhase } from "@/lib/clientWorkspace/types";

// 내부 17개 세부 단계는 DB엔 그대로 있지만, 화면엔 7개 상위 단계만 보여준다
// (고객관리 3단 워크스페이스 개편 2026-08-09, lib/workflow.ts의 WORKFLOW_PHASES).
export default function ProjectWorkflowStepper({ phases, progressPercent }: { phases: WorkspacePhase[]; progressPercent: number }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
        {phases.map((phase, index) => (
          <div key={phase.key} style={{ display: "flex", alignItems: "center", flex: index < phases.length - 1 ? 1 : "0 0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800,
                background: phase.status === "completed" ? C.teal : phase.status === "active" ? C.orange : "#fff",
                color: phase.status === "pending" ? C.hint : "#fff",
                border: phase.status === "pending" ? `1.5px solid ${C.border}` : "none",
              }}>
                {phase.status === "completed" ? <Check size={14} /> : phase.order}
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: phase.status === "active" ? 800 : 600,
                color: phase.status === "active" ? C.ink : C.muted, whiteSpace: "nowrap",
              }}>
                {phase.name}
              </span>
            </div>
            {index < phases.length - 1 ? (
              <div style={{ flex: 1, height: 2, background: phase.status === "completed" ? C.teal : C.border, margin: "0 4px", marginBottom: 16 }} />
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 6, borderRadius: R.full, background: C.border, overflow: "hidden" }}>
          <div style={{ width: `${progressPercent}%`, height: "100%", background: C.teal, borderRadius: R.full, transition: "width .3s" }} />
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.teal, flexShrink: 0 }}>{progressPercent}%</span>
      </div>
    </div>
  );
}
