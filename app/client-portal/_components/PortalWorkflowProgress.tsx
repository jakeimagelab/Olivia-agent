"use client";

import { CLIENT_WORKFLOW_STAGES, getClientWorkflowStage } from "@/lib/pcrm/clientWorkflow";

export default function PortalWorkflowProgress({ currentStepKey, completed = false }: {
  currentStepKey?: string | null;
  completed?: boolean;
}) {
  const current = getClientWorkflowStage(currentStepKey);
  const currentIndex = CLIENT_WORKFLOW_STAGES.findIndex((stage) => stage.key === current);

  return (
    <div className="pcrm-client-progress" aria-label="프로젝트 진행 과정">
      {CLIENT_WORKFLOW_STAGES.map((stage, index) => {
        const done = completed || index < currentIndex;
        const active = !completed && index === currentIndex;
        return (
          <div key={stage.key} className={`${done ? "is-done" : ""} ${active ? "is-current" : ""}`}>
            <span>{done ? "✓" : index + 1}</span>
            <strong>{stage.label}</strong>
          </div>
        );
      })}
    </div>
  );
}
