"use client";

import { useCallback, useEffect, type MutableRefObject } from "react";

import type {
  CustomerBridgeColorLabel,
  CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";
import { useCustomerBridgeMediaRequests } from "./useCustomerBridgeMedia";
import { useCustomerBridgeReviewController } from "./useCustomerBridgeReviewController";

export function useCustomerBridgeViewerController({
  images,
  visibleImages,
  renderedImages,
  imageById,
  selectedIds,
  focusedImageId,
  ratings,
  colorLabels,
  setFocusedImageId,
  applyRatingTo,
  applyColorTo,
  requestMedia,
  setMobileImageOpener,
  fullscreenCloseRef,
}: {
  images: readonly CustomerBridgeImage[];
  visibleImages: readonly CustomerBridgeImage[];
  renderedImages: readonly CustomerBridgeImage[];
  imageById: ReadonlyMap<string, CustomerBridgeImage>;
  selectedIds: ReadonlySet<string>;
  focusedImageId: string | null;
  ratings: Readonly<Record<string, CustomerBridgeRating>>;
  colorLabels: Readonly<Record<string, CustomerBridgeColorLabel>>;
  setFocusedImageId: (imageId: string | null) => void;
  applyRatingTo: (targetIds: ReadonlySet<string>, rating: 0 | CustomerBridgeRating) => void;
  applyColorTo: (targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => void;
  requestMedia: (imageIds: readonly string[], variant: SelectionMediaVariant) => Promise<void>;
  setMobileImageOpener: (opener: (imageId: string) => void) => void;
  fullscreenCloseRef: MutableRefObject<() => void>;
}) {
  const viewer = useCustomerBridgeReviewController({
    images,
    visibleImages,
    imageById,
    selectedIds,
    focusedImageId,
    ratings,
    colorLabels,
    onFocusImage: setFocusedImageId,
    onApplyRating: applyRatingTo,
    onApplyColor: applyColorTo,
  });

  useEffect(() => {
    setMobileImageOpener(viewer.openFullscreen);
  }, [setMobileImageOpener, viewer.openFullscreen]);
  useEffect(() => {
    fullscreenCloseRef.current = () => {
      if (viewer.fullscreenId) viewer.closeFullscreen();
    };
  }, [fullscreenCloseRef, viewer.closeFullscreen, viewer.fullscreenId]);

  useCustomerBridgeMediaRequests({
    renderedImages,
    visibleImages,
    focusedImageId,
    fullscreenId: viewer.fullscreenId,
    reviewImages: viewer.reviewImages,
    reviewActiveId: viewer.reviewActiveId,
    requestMedia,
  });

  const openFocusedFullscreen = useCallback(() => {
    if (focusedImageId) viewer.openFullscreen(focusedImageId);
  }, [focusedImageId, viewer.openFullscreen]);

  return { ...viewer, openFocusedFullscreen };
}
