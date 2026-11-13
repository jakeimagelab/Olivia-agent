"use client";

import { useCallback, useEffect, useMemo } from "react";

import { useSelectionSyncQueue } from "@/components/person-select/useSelectionSyncQueue";
import {
  useCustomerBridgeMarkState,
  type CustomerBridgeInitialSelection,
} from "@/components/select-gallery/useCustomerBridgeMarkState";
import {
  type SelectionSyncDiff,
  type SharedSelectionSyncSnapshot,
} from "@/lib/person-select/selectionSync";
import { sendSelectionSyncBatch } from "@/lib/person-select/selectionSyncClient";
import {
  applyCustomerColorLabels,
  applyCustomerRatings,
  clearCustomerBridgeMarks,
  customerBridgeSelectedIds,
  resolveCustomerColorToggle,
  type CustomerBridgeColorLabel,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeDraft } from "@/lib/select-gallery/customerBridgeTypes";

export type { CustomerBridgeInitialSelection } from "@/components/select-gallery/useCustomerBridgeMarkState";

export function useCustomerBridgeMarksController({
  endpointBase,
  localStorageScope,
  initialDraft,
  initialSelection,
  readOnly,
}: {
  endpointBase: string;
  localStorageScope: string;
  initialDraft?: CustomerBridgeDraft | null;
  initialSelection?: CustomerBridgeInitialSelection;
  readOnly: boolean;
}) {
  const markState = useCustomerBridgeMarkState({ initialDraft, initialSelection });
  const {
    serverRatings,
    serverColorLabels,
    serverNotes,
    customerRatings,
    customerColorLabels,
    notes,
    setNotes,
    customerRatingsRef,
    customerColorLabelsRef,
    replaceCustomerRatings,
    replaceCustomerColorLabels,
    installServerSnapshot,
    restorePending,
    clearDisplayedSelection,
    getDraftRevision,
  } = markState;

  const sendSelectionDiffs = useCallback(async ({ clientId, diffs }: { clientId: string; diffs: SelectionSyncDiff[] }) => {
    return sendSelectionSyncBatch<SharedSelectionSyncSnapshot>({
      endpoint: `${endpointBase}/draft`,
      clientId,
      diffs,
      responseKey: "draft",
    });
  }, [endpointBase]);

  const selectionSync = useSelectionSyncQueue({
    storageKey: `person-select-sync:${localStorageScope}`,
    enabled: !readOnly,
    sendBatch: sendSelectionDiffs,
    onSnapshot: installServerSnapshot,
    onRestore: restorePending,
  });
  const {
    enqueue: enqueueSelectionSync,
    getPendingDiffs: getPendingSelectionDiffs,
  } = selectionSync;

  useEffect(() => {
    if (!initialDraft || Number(initialDraft.revision ?? 0) <= getDraftRevision()) return;
    installServerSnapshot(initialDraft as SharedSelectionSyncSnapshot, getPendingSelectionDiffs());
  }, [getDraftRevision, getPendingSelectionDiffs, initialDraft, installServerSnapshot]);

  const applyRatingTo = useCallback((targetIds: ReadonlySet<string>, rating: 0 | CustomerBridgeRating) => {
    if (readOnly || !targetIds.size) return;
    if (rating === 0) {
      replaceCustomerRatings(clearCustomerBridgeMarks(customerRatingsRef.current, targetIds));
      replaceCustomerColorLabels(clearCustomerBridgeMarks(customerColorLabelsRef.current, targetIds));
      enqueueSelectionSync([...targetIds].flatMap((imageId) => [
        { imageId, rating: null },
        { imageId, colorLabel: null },
      ]));
      return;
    }
    replaceCustomerRatings(applyCustomerRatings(customerRatingsRef.current, targetIds, rating));
    enqueueSelectionSync([...targetIds].map((imageId) => ({ imageId, rating })));
  }, [customerColorLabelsRef, customerRatingsRef, enqueueSelectionSync, readOnly, replaceCustomerColorLabels, replaceCustomerRatings]);

  const applyColorTo = useCallback((targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => {
    if (readOnly || !targetIds.size) return;
    replaceCustomerColorLabels(applyCustomerColorLabels(customerColorLabelsRef.current, targetIds, colorLabel));
    enqueueSelectionSync([...targetIds].map((imageId) => ({ imageId, colorLabel })));
  }, [customerColorLabelsRef, enqueueSelectionSync, readOnly, replaceCustomerColorLabels]);

  const toggleColorTo = useCallback((targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => {
    if (readOnly || !targetIds.size) return;
    const update = resolveCustomerColorToggle(customerColorLabelsRef.current, targetIds, colorLabel);
    replaceCustomerColorLabels(update.colorLabels);
    enqueueSelectionSync(update.patches);
  }, [customerColorLabelsRef, enqueueSelectionSync, readOnly, replaceCustomerColorLabels]);

  const updateNote = useCallback((imageId: string, value: string) => {
    if (readOnly || !imageId) return;
    setNotes((current) => current[imageId] === value ? current : { ...current, [imageId]: value });
    enqueueSelectionSync([{ imageId, memo: value }]);
  }, [enqueueSelectionSync, readOnly, setNotes]);

  const serverSelectedIds = useMemo(
    () => customerBridgeSelectedIds(serverRatings, serverColorLabels),
    [serverColorLabels, serverRatings],
  );
  const customerSelectedIds = useMemo(
    () => customerBridgeSelectedIds(customerRatings, customerColorLabels),
    [customerColorLabels, customerRatings],
  );
  return {
    serverRatings,
    serverColorLabels,
    serverNotes,
    customerRatings,
    customerColorLabels,
    notes,
    serverSelectedIds,
    customerSelectedIds,
    selectionSync,
    enqueueSelectionSync,
    flushSelectionSync: selectionSync.flushNow,
    getPendingSelectionDiffs,
    installServerSnapshot,
    getDraftRevision,
    applyRatingTo,
    applyColorTo,
    toggleColorTo,
    updateNote,
    clearDisplayedSelection,
  };
}
