"use client";

import { createPortal } from "react-dom";
import ProjectWorkflowStepper from "./ProjectWorkflowStepper";
import type { WorkspacePhase } from "@/lib/clientWorkspace/types";

// 고객관리 2열 단순화(2026-08-09) — 메인 화면은 컴팩트 진행바만 보여주고,
// "전체 과정 보기" 클릭 시 여기서 기존 ProjectWorkflowStepper 전체 버전을 그대로 보여준다.
export default function ProgressDetailModal({
  open,
  onClose,
  phases,
  progressPercent,
}: {
  open: boolean;
  onClose: () => void;
  phases: WorkspacePhase[];
  progressPercent: number;
}) {
  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pcrm-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="pcrm-project-dialog">
        <header>
          <div><span>PCRM · WORKFLOW</span><h2>전체 진행 상황</h2><p>7단계 워크플로우 전체 과정입니다.</p></div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div style={{ padding: "8px 4px 4px" }}>
          <ProjectWorkflowStepper phases={phases} progressPercent={progressPercent} />
        </div>

        <footer>
          <button type="button" onClick={onClose}>닫기</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
