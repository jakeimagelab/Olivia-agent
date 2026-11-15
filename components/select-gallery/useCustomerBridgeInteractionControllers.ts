"use client";

import { useCallback, type MutableRefObject } from "react";

import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { useCustomerBridgeBrowserController } from "./useCustomerBridgeBrowserController";
import { useCustomerBridgeDownload, type CustomerBridgeDownloadFormat } from "./useCustomerBridgeDownload";
import { useCustomerBridgeFinalizeController } from "./useCustomerBridgeFinalizeController";
import type { useCustomerBridgeMarksController } from "./useCustomerBridgeMarksController";
import type { useCustomerBridgeMediaStore } from "./useCustomerBridgeMedia";
import type { useCustomerBridgeQuality } from "./useCustomerBridgeQuality";
import { useCustomerBridgeSideController } from "./useCustomerBridgeSideController";
import { useCustomerBridgeViewerController } from "./useCustomerBridgeViewerController";

type CustomerBridgeInteractionOptions = {
  endpointBase: string;
  localStorageScope: string;
  readOnly: boolean;
  messagesEnabled: boolean;
  mobile: boolean;
  images: CustomerBridgeImage[];
  media: Pick<ReturnType<typeof useCustomerBridgeMediaStore>, "imageById" | "requestMedia">;
  marks: ReturnType<typeof useCustomerBridgeMarksController>;
  browser: ReturnType<typeof useCustomerBridgeBrowserController>;
  quality: ReturnType<typeof useCustomerBridgeQuality>;
  fullscreenCloseRef: MutableRefObject<() => void>;
  setFilter: Parameters<typeof useCustomerBridgeFinalizeController>[0]["setFilter"];
  onSubmitted: (selection: unknown) => void;
  onStorageError: (scope: string, error: unknown) => void;
};

export function useCustomerBridgeInteractionControllers({
  endpointBase,
  localStorageScope,
  readOnly,
  messagesEnabled,
  mobile,
  images,
  media,
  marks,
  browser,
  quality,
  fullscreenCloseRef,
  setFilter,
  onSubmitted,
  onStorageError,
}: CustomerBridgeInteractionOptions) {
  const download = useCustomerBridgeDownload({
    endpointBase,
    readOnly,
    pendingCount: marks.selectionSync.pendingCount,
    selectedIds: marks.serverSelectedIds,
  });
  const downloadSelected = download.downloadSelected;
  const handleDownload = useCallback((format: CustomerBridgeDownloadFormat) => {
    void downloadSelected(format);
  }, [downloadSelected]);

  const focusedImage = browser.focusedImageId
    ? media.imageById.get(browser.focusedImageId) ?? null
    : null;
  const viewer = useCustomerBridgeViewerController({
    images,
    visibleImages: browser.visibleImages,
    renderedImages: browser.renderedImages,
    imageById: media.imageById,
    selectedIds: marks.customerSelectedIds,
    focusedImageId: browser.focusedImageId,
    ratings: marks.customerRatings,
    colorLabels: marks.customerColorLabels,
    setFocusedImageId: browser.setFocusedImageId,
    applyRatingTo: marks.applyRatingTo,
    applyColorTo: marks.applyColorTo,
    requestMedia: media.requestMedia,
    setMobileImageOpener: browser.setMobileImageOpener,
    fullscreenCloseRef,
  });

  const finalize = useCustomerBridgeFinalizeController({
    endpointBase,
    localStorageScope,
    readOnly,
    selectedIds: marks.customerSelectedIds,
    ratings: marks.customerRatings,
    colorLabels: marks.customerColorLabels,
    notes: marks.notes,
    images,
    pendingCount: marks.selectionSync.pendingCount,
    flushSelectionSync: marks.flushSelectionSync,
    getDraftRevision: marks.getDraftRevision,
    onSubmitted,
    onStorageError,
    serverRatings: marks.serverRatings,
    serverColorLabels: marks.serverColorLabels,
    serverNotes: marks.serverNotes,
    enqueueSelectionSync: marks.enqueueSelectionSync,
    clearDisplayedSelection: marks.clearDisplayedSelection,
    clearActiveSelection: browser.clearActiveSelection,
    resetReview: viewer.resetReview,
    setFilter,
  });

  const side = useCustomerBridgeSideController({
    endpointBase,
    messagesEnabled,
    mobile,
    focusedImageId: browser.focusedImageId,
    activeImageIds: browser.activeImageIds,
    applyRatingTo: marks.applyRatingTo,
    toggleColorTo: marks.toggleColorTo,
    updateNote: marks.updateNote,
    reviewQuality: quality.reviewQuality,
  });

  return {
    download,
    handleDownload,
    focusedImage,
    viewer,
    finalize,
    side,
  };
}
