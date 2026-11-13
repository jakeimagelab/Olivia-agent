"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { BridgeSelectedIdsUpdater } from "@/components/olivia-bridge/useOliviaBridgeSelectionState";
import { mergeBridgeSelectionIds } from "@/lib/photo-bridge/selectionChange";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

export function useOliviaBridgeSelectionActions({
  folderSelectionSourceKey,
  activateSelectionSource,
  adobeRatings,
  publishRatingsForSource,
  customerSelectedIds,
  setSelectedIds,
  resetComparisonFilter,
  syncAdobeBridgeSelection,
  setSceneReviewOpen,
}: {
  folderSelectionSourceKey: string;
  activateSelectionSource: (source: BridgeSelectionSource) => void;
  adobeRatings: Record<string, number>;
  publishRatingsForSource: (source: BridgeSelectionSource, adobeRatings: Record<string, number>) => void;
  customerSelectedIds: ReadonlySet<string>;
  setSelectedIds: (value: BridgeSelectedIdsUpdater) => void;
  resetComparisonFilter: () => void;
  syncAdobeBridgeSelection: () => Promise<void>;
  setSceneReviewOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const changeSelectionSource = useCallback((source: BridgeSelectionSource) => {
    activateSelectionSource(source);
    if (folderSelectionSourceKey) {
      try {
        localStorage.setItem(`olivia-bridge-selection-source:${folderSelectionSourceKey}`, source);
      } catch {
        // 브라우저 저장소를 사용할 수 없어도 현재 창의 기준 변경은 유지한다.
      }
    }
    publishRatingsForSource(source, adobeRatings);
  }, [activateSelectionSource, adobeRatings, folderSelectionSourceKey, publishRatingsForSource]);

  const addCustomerSelectionToAdminSelection = useCallback(() => {
    if (!customerSelectedIds.size) return;
    setSelectedIds((current) => mergeBridgeSelectionIds(current, customerSelectedIds));
    resetComparisonFilter();
  }, [customerSelectedIds, resetComparisonFilter, setSelectedIds]);

  const openSceneReview = useCallback(() => {
    setSceneReviewOpen(true);
    void syncAdobeBridgeSelection();
  }, [setSceneReviewOpen, syncAdobeBridgeSelection]);

  const refreshAdobeMarks = useCallback(() => {
    void syncAdobeBridgeSelection();
  }, [syncAdobeBridgeSelection]);

  return {
    changeSelectionSource,
    addCustomerSelectionToAdminSelection,
    openSceneReview,
    refreshAdobeMarks,
  };
}
