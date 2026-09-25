"use client";

export const OLIVIA_CORE_SNAPSHOT_UPDATED_EVENT = "olivia-core-snapshot-updated";

export type CoreSnapshotUpdatedDetail = {
  workflowRunId: string;
};

export function notifyCoreSnapshotUpdated(workflowRunId: string) {
  const normalized = workflowRunId.trim();
  if (!normalized || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CoreSnapshotUpdatedDetail>(
    OLIVIA_CORE_SNAPSHOT_UPDATED_EVENT,
    { detail: { workflowRunId: normalized } },
  ));
}

export function coreSnapshotUpdatedWorkflowRunId(event: Event) {
  const detail = (event as CustomEvent<CoreSnapshotUpdatedDetail>).detail;
  return typeof detail?.workflowRunId === "string" ? detail.workflowRunId : undefined;
}
