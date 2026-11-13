"use client";

import { useCallback } from "react";

import type { SelectionSyncPatch } from "@/lib/person-select/selectionSync";
import type {
  CustomerBridgeColorLabel,
  CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { CustomerBridgePhotoFilter } from "@/lib/select-gallery/customerBridgeView";
import { useCustomerBridgeResetController } from "./useCustomerBridgeResetController";
import { useCustomerBridgeSubmission } from "./useCustomerBridgeSubmission";

export function useCustomerBridgeFinalizeController({
  endpointBase,
  localStorageScope,
  readOnly,
  selectedIds,
  ratings,
  colorLabels,
  notes,
  images,
  pendingCount,
  flushSelectionSync,
  getDraftRevision,
  onSubmitted,
  onStorageError,
  serverRatings,
  serverColorLabels,
  serverNotes,
  enqueueSelectionSync,
  clearDisplayedSelection,
  clearActiveSelection,
  resetReview,
  setFilter,
}: {
  endpointBase: string;
  localStorageScope: string;
  readOnly: boolean;
  selectedIds: ReadonlySet<string>;
  ratings: Record<string, CustomerBridgeRating>;
  colorLabels: Record<string, CustomerBridgeColorLabel>;
  notes: Record<string, string>;
  images: CustomerBridgeImage[];
  pendingCount: number;
  flushSelectionSync: () => Promise<boolean>;
  getDraftRevision: () => number;
  onSubmitted: (selection: unknown) => void;
  onStorageError: (scope: string, error: unknown) => void;
  serverRatings: Readonly<Record<string, CustomerBridgeRating>>;
  serverColorLabels: Readonly<Record<string, CustomerBridgeColorLabel>>;
  serverNotes: Readonly<Record<string, string>>;
  enqueueSelectionSync: (patches: SelectionSyncPatch[]) => void;
  clearDisplayedSelection: () => void;
  clearActiveSelection: () => void;
  resetReview: () => void;
  setFilter: (filter: CustomerBridgePhotoFilter) => void;
}) {
  const submission = useCustomerBridgeSubmission({
    endpointBase,
    localStorageScope,
    readOnly,
    selectedIds,
    ratings,
    colorLabels,
    notes,
    images,
    pendingCount,
    flushNow: flushSelectionSync,
    getRevision: getDraftRevision,
    onSubmitted,
    onStorageError,
  });
  const handleResetComplete = useCallback(() => {
    clearActiveSelection();
    resetReview();
    setFilter("all");
    submission.setError("");
  }, [clearActiveSelection, resetReview, setFilter, submission.setError]);
  const reset = useCustomerBridgeResetController({
    readOnly,
    customerRatings: ratings,
    customerColorLabels: colorLabels,
    notes,
    serverRatings,
    serverColorLabels,
    serverNotes,
    enqueueSelectionSync,
    clearDisplayedSelection,
    flushSelectionSync,
    onResetComplete: handleResetComplete,
    onError: submission.setError,
  });
  const openSubmitReview = useCallback(() => {
    void submission.openReview();
  }, [submission.openReview]);

  return {
    submitError: submission.error,
    submitting: submission.submitting,
    submitReviewOpen: submission.reviewOpen,
    openSubmitReview,
    closeSubmitReview: submission.closeReview,
    submit: submission.submit,
    submitReviewItems: submission.reviewItems,
    submitReviewSections: submission.reviewSections,
    ...reset,
  };
}
