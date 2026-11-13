"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type {
  SelectionSyncDiff,
  SharedSelectionSyncSnapshot,
} from "@/lib/person-select/selectionSync";
import {
  customerBridgeSelectedIds,
  normalizeCustomerBridgeSelectionMarks,
  reconcileCustomerBridgeRecord,
  type CustomerBridgeColorLabel,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import { resolveCustomerBridgeSnapshotState } from "@/lib/select-gallery/customerBridgeSnapshot";
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

export function useCustomerBridgeMarkState({
  initialDraft,
  initialSelection,
}: {
  initialDraft?: CustomerBridgeDraft | null;
  initialSelection?: CustomerBridgeInitialSelection;
}) {
  const seedMarks = useMemo(() => normalizeCustomerBridgeSelectionMarks({
    selectedImageIds: initialDraft?.selectedImageIds ?? (initialSelection?.items ?? []).map((item) => item.image_id),
    ratings: initialDraft?.ratings
      ?? Object.fromEntries((initialSelection?.items ?? []).map((item) => [item.image_id, item.customer_rating ?? 0])),
    colorLabels: initialDraft?.colorLabels
      ?? Object.fromEntries((initialSelection?.items ?? []).map((item) => [item.image_id, item.customer_color_label ?? 0])),
  }), [initialDraft, initialSelection]);
  const seedNotes = useMemo(() => initialDraft?.imageNotes
    ?? Object.fromEntries((initialSelection?.items ?? [])
      .filter((item) => item.memo)
      .map((item) => [item.image_id, item.memo ?? ""])), [initialDraft, initialSelection]);

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
    setServerRatings((current) => reconcileCustomerBridgeRecord(
      current,
      canonical.ratings as Record<string, CustomerBridgeRating>,
    ));
    setServerColorLabels((current) => reconcileCustomerBridgeRecord(
      current,
      canonical.colorLabels as Record<string, CustomerBridgeColorLabel>,
    ));
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

  const clearDisplayedSelection = useCallback(() => {
    replaceCustomerRatings({});
    replaceCustomerColorLabels({});
    setNotes({});
  }, [replaceCustomerColorLabels, replaceCustomerRatings]);

  const getDraftRevision = useCallback(() => revisionRef.current, []);

  return {
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
  };
}
