"use client";

import { useCallback, useMemo, useState } from "react";
import { removeBridgeReviewItem, restoreBridgeReviewItem } from "@/lib/photo-bridge/reviewMode";
import type { CustomerBridgeColorLabel, CustomerBridgeRating } from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { CustomerBridgeReviewRemovedMarks } from "./CustomerBridgeOverlays";

export function customerBridgeReviewSelectionIds(
  images: readonly CustomerBridgeImage[],
  selectedIds: ReadonlySet<string>,
) {
  return images.flatMap((image) => selectedIds.has(image.id) ? [image.id] : []);
}

export function customerBridgeReviewImages(
  reviewIds: readonly string[] | null,
  imageById: ReadonlyMap<string, CustomerBridgeImage>,
) {
  if (!reviewIds) return [];
  return reviewIds.flatMap((id) => {
    const image = imageById.get(id);
    return image ? [image] : [];
  });
}

export function customerBridgeFullscreenStep(
  images: readonly CustomerBridgeImage[],
  currentId: string | null,
  delta: -1 | 1,
) {
  if (!images.length) return null;
  const currentIndex = currentId ? images.findIndex((image) => image.id === currentId) : -1;
  const current = currentIndex >= 0 ? currentIndex : 0;
  return images[(current + delta + images.length) % images.length] ?? null;
}

export function useCustomerBridgeReviewController({
  images,
  visibleImages,
  imageById,
  selectedIds,
  focusedImageId,
  ratings,
  colorLabels,
  onFocusImage,
  onApplyRating,
  onApplyColor,
}: {
  images: readonly CustomerBridgeImage[];
  visibleImages: readonly CustomerBridgeImage[];
  imageById: ReadonlyMap<string, CustomerBridgeImage>;
  selectedIds: ReadonlySet<string>;
  focusedImageId: string | null;
  ratings: Readonly<Record<string, CustomerBridgeRating>>;
  colorLabels: Readonly<Record<string, CustomerBridgeColorLabel>>;
  onFocusImage: (imageId: string) => void;
  onApplyRating: (targetIds: ReadonlySet<string>, rating: 0 | CustomerBridgeRating) => void;
  onApplyColor: (targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => void;
}) {
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[] | null>(null);
  const [reviewActiveId, setReviewActiveId] = useState<string | null>(null);
  const [reviewRemoved, setReviewRemoved] = useState<CustomerBridgeReviewRemovedMarks | null>(null);

  const fullscreenImage = fullscreenId ? imageById.get(fullscreenId) ?? null : null;
  const fullscreenIndex = fullscreenId ? visibleImages.findIndex((image) => image.id === fullscreenId) : -1;
  const reviewImages = useMemo(
    () => customerBridgeReviewImages(reviewIds, imageById),
    [imageById, reviewIds],
  );

  const openFullscreen = useCallback((imageId: string) => {
    setFullscreenId(imageId);
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreenId(null);
  }, []);

  const toggleFullscreenZoom = useCallback(() => {
    setZoomed((current) => !current);
  }, []);

  const moveFullscreen = useCallback((delta: -1 | 1) => {
    const next = customerBridgeFullscreenStep(visibleImages, fullscreenId, delta);
    if (!next) return;
    setFullscreenId(next.id);
    onFocusImage(next.id);
    setZoomed(false);
  }, [fullscreenId, onFocusImage, visibleImages]);

  const openReview = useCallback(() => {
    const ids = customerBridgeReviewSelectionIds(images, selectedIds);
    if (!ids.length) return;
    setReviewIds(ids);
    setReviewActiveId(focusedImageId && ids.includes(focusedImageId) ? focusedImageId : ids[0]);
    setReviewRemoved(null);
  }, [focusedImageId, images, selectedIds]);

  const closeReview = useCallback(() => {
    setReviewIds(null);
  }, []);

  const resetReview = useCallback(() => {
    setReviewIds(null);
    setReviewActiveId(null);
    setReviewRemoved(null);
  }, []);

  const moveReview = useCallback((delta: -1 | 1) => {
    if (!reviewIds?.length) return;
    const index = Math.max(0, reviewIds.indexOf(reviewActiveId ?? reviewIds[0]));
    setReviewActiveId(reviewIds[(index + delta + reviewIds.length) % reviewIds.length]);
  }, [reviewActiveId, reviewIds]);

  const removeFromReview = useCallback((id: string) => {
    if (!reviewIds) return;
    const rating = ratings[id] ?? null;
    const colorLabel = colorLabels[id] ?? null;
    if (!rating && !colorLabel) return;
    const removed = removeBridgeReviewItem(reviewIds, id);
    setReviewIds(removed.remainingIds);
    setReviewActiveId(removed.nextActiveId);
    setReviewRemoved(removed.removed ? { ...removed.removed, rating, colorLabel } : null);
    onApplyRating(new Set([id]), 0);
  }, [colorLabels, onApplyRating, ratings, reviewIds]);

  const restoreReview = useCallback(() => {
    if (!reviewIds || !reviewRemoved) return;
    const restored = restoreBridgeReviewItem(reviewIds, reviewRemoved);
    setReviewIds(restored.restoredIds);
    setReviewActiveId(restored.activeId);
    if (reviewRemoved.rating) onApplyRating(new Set([reviewRemoved.id]), reviewRemoved.rating);
    if (reviewRemoved.colorLabel) onApplyColor(new Set([reviewRemoved.id]), reviewRemoved.colorLabel);
    setReviewRemoved(null);
  }, [onApplyColor, onApplyRating, reviewIds, reviewRemoved]);

  return {
    fullscreenId,
    fullscreenImage,
    fullscreenIndex,
    zoomed,
    openFullscreen,
    closeFullscreen,
    toggleFullscreenZoom,
    moveFullscreen,
    reviewIds,
    reviewActiveId,
    reviewRemoved,
    reviewImages,
    setReviewActiveId,
    openReview,
    closeReview,
    resetReview,
    moveReview,
    removeFromReview,
    restoreReview,
  };
}
