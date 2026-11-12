"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";

export function useOliviaBridgePreviewNavigation({
  selectionReviewOpen,
  reviewActivePhoto,
  reviewActiveIndex,
  reviewPhotoCount,
  focusedPhoto,
  focusedIndex,
  visiblePhotoCount,
  moveReview,
  moveFocus,
  setFullscreenPreviewOpen,
}: {
  selectionReviewOpen: boolean;
  reviewActivePhoto: BridgeJpgFile | null | undefined;
  reviewActiveIndex: number;
  reviewPhotoCount: number;
  focusedPhoto: BridgeJpgFile | null | undefined;
  focusedIndex: number;
  visiblePhotoCount: number;
  moveReview: (delta: -1 | 1) => void;
  moveFocus: (delta: number) => void;
  setFullscreenPreviewOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const fullscreenPhoto = selectionReviewOpen ? reviewActivePhoto : focusedPhoto;
  const fullscreenIndex = selectionReviewOpen ? reviewActiveIndex : focusedIndex;
  const fullscreenTotal = selectionReviewOpen ? reviewPhotoCount : visiblePhotoCount;

  const openFullscreenPreview = useCallback(() => {
    if (!fullscreenPhoto || fullscreenIndex < 0) return;
    setFullscreenPreviewOpen(true);
  }, [fullscreenIndex, fullscreenPhoto, setFullscreenPreviewOpen]);

  const moveFullscreenPreview = useCallback((delta: number) => {
    if (selectionReviewOpen) moveReview(delta < 0 ? -1 : 1);
    else moveFocus(delta);
  }, [moveFocus, moveReview, selectionReviewOpen]);

  return {
    fullscreenPhoto,
    fullscreenIndex,
    fullscreenTotal,
    openFullscreenPreview,
    moveFullscreenPreview,
  };
}
