import type { CoreProjectSnapshot } from "@/lib/core/readModels/types";
import {
  ACTIVE_WORKFLOW_STEP_KEYS,
  getWorkflowDisplayStepKey,
  type ActiveWorkflowStepKey,
} from "@/lib/workflow";

function normalizedStepIndex(stepKey: string) {
  const normalized = getWorkflowDisplayStepKey(stepKey);
  return normalized ? ACTIVE_WORKFLOW_STEP_KEYS.indexOf(normalized) : -1;
}

function hasCompletedStep(snapshot: CoreProjectSnapshot, stepKey: ActiveWorkflowStepKey) {
  return snapshot.workflow.completedSteps.some(
    (completed) => getWorkflowDisplayStepKey(completed) === stepKey,
  );
}

export function isWorkflowPastStep(
  snapshot: CoreProjectSnapshot,
  stepKey: ActiveWorkflowStepKey,
) {
  const currentIndex = normalizedStepIndex(snapshot.workflow.currentStep);
  const targetIndex = ACTIVE_WORKFLOW_STEP_KEYS.indexOf(stepKey);
  return currentIndex >= 0 && targetIndex >= 0 && currentIndex > targetIndex;
}

export function isContractCoreCompleted(
  snapshot: CoreProjectSnapshot,
  contractId: string,
) {
  const contract = snapshot.resources.contract;
  return Boolean(
    contract
    && contract.id === contractId
    && contract.status === "final"
    && (hasCompletedStep(snapshot, "contract") || isWorkflowPastStep(snapshot, "contract")),
  );
}

export function isContiCoreCompleted(
  snapshot: CoreProjectSnapshot,
  contiId: string,
) {
  const conti = snapshot.resources.conti;
  return Boolean(
    conti
    && conti.id === contiId
    && (hasCompletedStep(snapshot, "conti") || isWorkflowPastStep(snapshot, "conti")),
  );
}
