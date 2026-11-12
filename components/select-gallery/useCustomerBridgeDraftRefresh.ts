"use client";

import { useCallback } from "react";
import { useVisibleSelectionRefresh } from "@/components/person-select/useVisibleSelectionRefresh";
import type { SelectionSyncDiff, SharedSelectionSyncSnapshot } from "@/lib/person-select/selectionSync";
import { readSelectionJsonResponse } from "@/lib/person-select/selectionSyncClient";

export function useCustomerBridgeDraftRefresh({
  enabled,
  endpointBase,
  installServerSnapshot,
  getPendingSelectionDiffs,
}: {
  enabled: boolean;
  endpointBase: string;
  installServerSnapshot: (snapshot: SharedSelectionSyncSnapshot, pending: SelectionSyncDiff[]) => void;
  getPendingSelectionDiffs: () => SelectionSyncDiff[];
}) {
  const refreshServerDraft = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch(`${endpointBase}/draft`, { cache: "no-store" });
      const result = await readSelectionJsonResponse<{ ok?: boolean; draft?: SharedSelectionSyncSnapshot }>(response);
      if (!response.ok || !result?.ok || !result.draft) return;
      installServerSnapshot(result.draft, getPendingSelectionDiffs());
    } catch {
      // 현재 큐를 지우지 않는다. 다음 focus 또는 자동 재시도 때 다시 동기화한다.
    }
  }, [enabled, endpointBase, getPendingSelectionDiffs, installServerSnapshot]);

  useVisibleSelectionRefresh({ enabled, refresh: refreshServerDraft });
}
