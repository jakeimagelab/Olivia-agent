"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSelectionSyncQueue } from "@/components/person-select/useSelectionSyncQueue";
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
  normalizeCustomerBridgeSelectionMarks,
  reconcileCustomerBridgeRecord,
  resolveCustomerColorToggle,
  type CustomerBridgeColorLabel,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import {
  resolveCustomerBridgeSnapshotState,
} from "@/lib/select-gallery/customerBridgeSnapshot";
import type { CustomerBridgeDraft } from "@/lib/select-gallery/customerBridgeTypes";

export type CustomerBridgeInitialSelection = {
  items?: Array<{
    image_id: string;
    customer_rating?: number | null;
    customer_color_label?: number | null;
    memo?: string | null;
  }>;
  customer_memo?: string | null;
} | null;

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
  const seedMarks = useMemo(() => normalizeCustomerBridgeSelectionMarks({
    selectedImageIds: initialDraft?.selectedImageIds ?? (initialSelection?.items ?? []).map((item) => item.image_id),
    ratings: initialDraft?.ratings
      ?? Object.fromEntries((initialSelection?.items ?? []).map((item) => [item.image_id, item.customer_rating ?? 0])),
    colorLabels: initialDraft?.colorLabels
      ?? Object.fromEntries((initialSelection?.items ?? []).map((item) => [item.image_id, item.customer_color_label ?? 0])),
  }), [initialDraft, initialSelection]);
  const seedNotes = useMemo(() => initialDraft?.imageNotes
    ?? Object.fromEntries((initialSelection?.items ?? []).filter((item) => item.memo).map((item) => [item.image_id, item.memo ?? ""])), [initialDraft, initialSelection]);

  const [serverRatings, setServerRatings] = useState<Record<string, CustomerBridgeRating>>(seedMarks.ratings);
  const [serverColorLabels, setServerColorLabels] = useState<Record<string, CustomerBridgeColorLabel>>(seedMarks.colorLabels);
  const [serverNotes, setServerNotes] = useState<Record<string, string>>(seedNotes);
  const [customerRatings, setCustomerRatings] = useState<Record<string, CustomerBridgeRating>>(seedMarks.ratings);
  const [customerColorLabels, setCustomerColorLabels] = useState<Record<string, CustomerBridgeColorLabel>>(seedMarks.colorLabels);
  const [notes, setNotes] = useState<Record<string, string>>(seedNotes);

  const customerRatingsRef = useRef(customerRatings);
  const customerColorLabelsRef = useRef(customerColorLabels);
  const revisionRef = useRef(initialDraft?.revision ?? 0);
  const serverSnapshotRef = useRef<SharedSelectionSyncSnapshot>({
    revision: initialDraft?.revision ?? 0,
    selectedImageIds: [...customerBridgeSelectedIds(seedMarks.ratings, seedMarks.colorLabels)],
    ratings: seedMarks.ratings,
    colorLabels: seedMarks.colorLabels,
    imageNotes: seedNotes,
    customerMemo: initialDraft?.customerMemo ?? initialSelection?.customer_memo ?? "",
    updatedAt: initialDraft?.updatedAt ?? null,
  });

  const replaceCustomerRatings = useCallback((next: Record<string, CustomerBridgeRating>) => {
    const reconciled = reconcileCustomerBridgeRecord(customerRatingsRef.current, next);
    customerRatingsRef.current = reconciled;
    setCustomerRatings((current) => current === reconciled ? current : reconciled);
  }, []);
  const replaceCustomerColorLabels = useCallback((next: Record<string, CustomerBridgeColorLabel>) => {
    const reconciled = reconcileCustomerBridgeRecord(customerColorLabelsRef.current, next);
    customerColorLabelsRef.current = reconciled;
    setCustomerColorLabels((current) => current === reconciled ? current : reconciled);
  }, []);

  const installServerSnapshot = useCallback((snapshot: SharedSelectionSyncSnapshot, pending: SelectionSyncDiff[]) => {
    const { canonical, displayed } = resolveCustomerBridgeSnapshotState(snapshot, pending);
    serverSnapshotRef.current = canonical;
    revisionRef.current = canonical.revision;
    setServerRatings((current) => reconcileCustomerBridgeRecord(current, canonical.ratings as Record<string, CustomerBridgeRating>));
    setServerColorLabels((current) => reconcileCustomerBridgeRecord(current, canonical.colorLabels as Record<string, CustomerBridgeColorLabel>));
    setServerNotes((current) => reconcileCustomerBridgeRecord(current, canonical.imageNotes));
    replaceCustomerRatings(displayed.ratings as Record<string, CustomerBridgeRating>);
    replaceCustomerColorLabels(displayed.colorLabels as Record<string, CustomerBridgeColorLabel>);
    setNotes((current) => reconcileCustomerBridgeRecord(current, displayed.imageNotes));
  }, [replaceCustomerColorLabels, replaceCustomerRatings]);

  const restorePending = useCallback((pending: SelectionSyncDiff[]) => {
    const { displayed } = resolveCustomerBridgeSnapshotState(serverSnapshotRef.current, pending);
    replaceCustomerRatings(displayed.ratings as Record<string, CustomerBridgeRating>);
    replaceCustomerColorLabels(displayed.colorLabels as Record<string, CustomerBridgeColorLabel>);
    setNotes((current) => reconcileCustomerBridgeRecord(current, displayed.imageNotes));
  }, [replaceCustomerColorLabels, replaceCustomerRatings]);

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
    if (!initialDraft || Number(initialDraft.revision ?? 0) <= serverSnapshotRef.current.revision) return;
    installServerSnapshot(initialDraft as SharedSelectionSyncSnapshot, getPendingSelectionDiffs());
  }, [getPendingSelectionDiffs, initialDraft, installServerSnapshot]);

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
  }, [enqueueSelectionSync, readOnly, replaceCustomerColorLabels, replaceCustomerRatings]);

  const applyColorTo = useCallback((targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => {
    if (readOnly || !targetIds.size) return;
    replaceCustomerColorLabels(applyCustomerColorLabels(customerColorLabelsRef.current, targetIds, colorLabel));
    enqueueSelectionSync([...targetIds].map((imageId) => ({ imageId, colorLabel })));
  }, [enqueueSelectionSync, readOnly, replaceCustomerColorLabels]);

  const toggleColorTo = useCallback((targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => {
    if (readOnly || !targetIds.size) return;
    const update = resolveCustomerColorToggle(customerColorLabelsRef.current, targetIds, colorLabel);
    replaceCustomerColorLabels(update.colorLabels);
    enqueueSelectionSync(update.patches);
  }, [enqueueSelectionSync, readOnly, replaceCustomerColorLabels]);

  const updateNote = useCallback((imageId: string, value: string) => {
    if (readOnly || !imageId) return;
    setNotes((current) => current[imageId] === value ? current : { ...current, [imageId]: value });
    enqueueSelectionSync([{ imageId, memo: value }]);
  }, [enqueueSelectionSync, readOnly]);

  const clearDisplayedSelection = useCallback(() => {
    replaceCustomerRatings({});
    replaceCustomerColorLabels({});
    setNotes({});
  }, [replaceCustomerColorLabels, replaceCustomerRatings]);

  const serverSelectedIds = useMemo(
    () => customerBridgeSelectedIds(serverRatings, serverColorLabels),
    [serverColorLabels, serverRatings],
  );
  const customerSelectedIds = useMemo(
    () => customerBridgeSelectedIds(customerRatings, customerColorLabels),
    [customerColorLabels, customerRatings],
  );
  const getDraftRevision = useCallback(() => revisionRef.current, []);

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
