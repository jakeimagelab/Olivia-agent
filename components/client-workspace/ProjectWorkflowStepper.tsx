"use client";

import { Check } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { WorkspacePhase } from "@/lib/clientWorkspace/types";

// 내부 17개 세부 단계는 DB엔 그대로 있지만, 화면엔 7개 상위 단계만 보여준다
// (고객관리 3단 워크스페이스 개편 2026-08-09, lib/workflow.ts의 WORKFLOW_PHASES).
// compact=true는 메인 화면의 줄어든 진행바용(라벨 숨김, 원 크기 축소) — 모달에서는
// compact=false(기본값)로 기존 그대로의 라벨 붙은 전체 버전을 보여준다.
// onSelectPhase가 있으면 원을 클릭 가능하게 만든다(코드 요청서 4차, 2026-08-16) — 현재
// 단계가 아닌 phase도 항상 클릭할 수 있다. 실제로 어느 스텝을 열지는 호출자가 정한다.
export default function ProjectWorkflowStepper({
  phases,
  progressPercent,
  compact = false,
  light = false,
  onSelectPhase,
}: {
  phases: WorkspacePhase[];
  progressPercent: number;
  compact?: boolean;
  light?: boolean;
  onSelectPhase?: (phase: WorkspacePhase) => void;
}) {
  const circleSize = compact ? 20 : 30;
  return (
    <div className={`pcrm-project-stepper${light ? " pcrm-project-stepper--light" : ""}`}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
        {phases.map((phase, index) => (
          <div key={phase.key} style={{ display: "flex", alignItems: "center", flex: index < phases.length - 1 ? 1 : "0 0 auto" }}>
            <button
              type="button"
              disabled={!onSelectPhase}
              onClick={() => onSelectPhase?.(phase)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0,
                border: "none", background: "none", padding: 0, font: "inherit",
                cursor: onSelectPhase ? "pointer" : "default",
              }}
            >
              <div style={{
                width: circleSize, height: circleSize, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: compact ? 9 : 12, fontWeight: 800,
                background: light
                  ? phase.status === "completed" ? C.mint : "#fff"
                  : phase.status === "completed" ? C.teal : phase.status === "active" ? C.orange : "#fff",
                color: light
                  ? phase.status === "pending" ? C.hint : C.teal
                  : phase.status === "pending" ? C.hint : "#fff",
                border: light
                  ? `1.5px solid ${phase.status === "active" ? C.teal : phase.status === "completed" ? "rgba(21,88,85,.22)" : C.border}`
                  : phase.status === "pending" ? `1.5px solid ${C.border}` : "none",
              }}>
                {phase.status === "completed" ? <Check size={compact ? 11 : 14} /> : phase.order}
              </div>
              {compact ? null : (
                <span style={{
                  fontSize: 10.5, fontWeight: phase.status === "active" ? 800 : 600,
                  color: phase.status === "active" ? C.ink : C.muted, whiteSpace: "nowrap",
                }}>
                  {phase.name}
                </span>
              )}
            </button>
            {index < phases.length - 1 ? (
              <div style={{ flex: 1, height: light ? 1 : 2, background: phase.status === "completed" ? (light ? "rgba(21,88,85,.25)" : C.teal) : C.border, margin: compact ? "0 4px" : "0 4px 16px" }} />
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ marginTop: compact ? 8 : 14, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: compact ? 4 : 6, borderRadius: R.full, background: C.border, overflow: "hidden" }}>
          <div style={{ width: `${progressPercent}%`, height: "100%", background: C.teal, borderRadius: R.full, transition: "width .3s" }} />
        </div>
        <span style={{ fontSize: compact ? 10.5 : 11.5, fontWeight: 800, color: C.teal, flexShrink: 0 }}>{progressPercent}%</span>
      </div>
    </div>
  );
}
