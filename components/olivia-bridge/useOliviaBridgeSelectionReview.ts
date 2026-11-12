"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";

import type { BridgeJpgFile, BridgeJpgSortMode } from "@/lib/photo-bridge/bridgeFiles";
import { sortBridgeJpgs } from "@/lib/photo-bridge/bridgeFiles";
import {
  cycleBridgeReviewIndex,
  removeBridgeReviewItem,
  restoreBridgeReviewItem,
  type BridgeReviewRemovedItem,
} from "@/lib/photo-bridge/reviewMode";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

type ReviewRemovedSource = BridgeReviewRemovedItem & {
  wasManual: boolean;
  wasAdobe: boolean;
};

type UseOliviaBridgeSelectionReviewOptions = {
  jpgs: readonly BridgeJpgFile[];
  jpgSortMode: BridgeJpgSortMode;
  selectedIds: ReadonlySet<string>;
  focusedId: string | null;
  selectionSourceRef: MutableRefObject<BridgeSelectionSource>;
  manualSelectedIdsRef: MutableRefObject<Set<string>>;
  adobeSelectedIdsRef: MutableRefObject<Set<string>>;
  workspaceRef: RefObject<HTMLDivElement | null>;
  setSelectedIds: (value: Set<string> | ((current: Set<string>) => Set<string>)) => void;
  setFocusedId: Dispatch<SetStateAction<string | null>>;
  setFocusedPlainId: Dispatch<SetStateAction<string | null>>;
  setAnchorId: Dispatch<SetStateAction<string | null>>;
  setPreviewSize: Dispatch<SetStateAction<{ width: number; height: number } | undefined>>;
  showAdobeSelectionNotice: () => void;
};

export function useOliviaBridgeSelectionReview({
  jpgs,
  jpgSortMode,
  selectedIds,
  focusedId,
  selectionSourceRef,
  manualSelectedIdsRef,
  adobeSelectedIdsRef,
  workspaceRef,
  setSelectedIds,
  setFocusedId,
  setFocusedPlainId,
  setAnchorId,
  setPreviewSize,
  showAdobeSelectionNotice,
}: UseOliviaBridgeSelectionReviewOptions) {
  const [selectionReviewOpen, setSelectionReviewOpen] = useState(false);
  const [reviewActiveId, setReviewActiveId] = useState<string | null>(null);
  const [reviewRemoved, setReviewRemoved] = useState<ReviewRemovedSource[]>([]);

  const reviewPhotos = useMemo(
    () => sortBridgeJpgs(jpgs.filter((photo) => selectedIds.has(photo.id)), jpgSortMode),
    [jpgSortMode, jpgs, selectedIds],
  );
  const resolvedReviewActiveId = reviewActiveId && reviewPhotos.some((photo) => photo.id === reviewActiveId)
    ? reviewActiveId
    : reviewPhotos[0]?.id ?? null;
  const reviewActiveIndex = reviewPhotos.findIndex((photo) => photo.id === resolvedReviewActiveId);
  const reviewActivePhoto = reviewPhotos[reviewActiveIndex] ?? null;

  const focusReviewPhoto = useCallback((id: string) => {
    setReviewActiveId(id);
    setFocusedId(id);
    setFocusedPlainId(null);
    setPreviewSize(undefined);
  }, [setFocusedId, setFocusedPlainId, setPreviewSize]);

  const openSelectionReview = useCallback(() => {
    const first = focusedId && selectedIds.has(focusedId)
      ? focusedId
      : jpgs.find((photo) => selectedIds.has(photo.id))?.id ?? null;
    if (!first) return;
    setReviewRemoved([]);
    setReviewActiveId(first);
    setFocusedId(first);
    setSelectionReviewOpen(true);
  }, [focusedId, jpgs, selectedIds, setFocusedId]);

  const closeSelectionReview = useCallback(() => {
    setSelectionReviewOpen(false);
    setReviewRemoved([]);
    setAnchorId(resolvedReviewActiveId);
    requestAnimationFrame(() => workspaceRef.current?.focus());
  }, [resolvedReviewActiveId, setAnchorId, workspaceRef]);

  const moveReview = useCallback((delta: -1 | 1) => {
    if (!reviewPhotos.length) return;
    const nextIndex = cycleBridgeReviewIndex(reviewActiveIndex, reviewPhotos.length, delta);
    const next = reviewPhotos[nextIndex];
    if (next) focusReviewPhoto(next.id);
  }, [focusReviewPhoto, reviewActiveIndex, reviewPhotos]);

  const removeReviewPhoto = useCallback(() => {
    const activeId = resolvedReviewActiveId;
    if (!activeId) return;
    if (selectionSourceRef.current === "adobe") {
      showAdobeSelectionNotice();
      return;
    }
    const result = removeBridgeReviewItem(reviewPhotos.map((photo) => photo.id), activeId);
    const removed = result.removed;
    if (!removed) return;
    const wasManual = manualSelectedIdsRef.current.has(activeId);
    const wasAdobe = adobeSelectedIdsRef.current.has(activeId);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(activeId);
      return next;
    });
    setReviewRemoved((current) => [...current, { ...removed, wasManual, wasAdobe }]);
    setReviewActiveId(result.nextActiveId);
    setFocusedId(result.nextActiveId);
  }, [adobeSelectedIdsRef, manualSelectedIdsRef, resolvedReviewActiveId, reviewPhotos, selectionSourceRef, setFocusedId, setSelectedIds, showAdobeSelectionNotice]);

  const restoreReviewPhoto = useCallback(() => {
    const removed = reviewRemoved.at(-1);
    if (!removed) return;
    if (selectionSourceRef.current === "adobe") {
      showAdobeSelectionNotice();
      return;
    }
    const restored = restoreBridgeReviewItem(reviewPhotos.map((photo) => photo.id), removed);
    setSelectedIds((current) => new Set(current).add(removed.id));
    setReviewRemoved((current) => current.slice(0, -1));
    if (restored.activeId) focusReviewPhoto(restored.activeId);
  }, [focusReviewPhoto, reviewPhotos, reviewRemoved, selectionSourceRef, setSelectedIds, showAdobeSelectionNotice]);

  return {
    selectionReviewOpen,
    reviewRemoved,
    reviewPhotos,
    resolvedReviewActiveId,
    reviewActiveIndex,
    reviewActivePhoto,
    focusReviewPhoto,
    openSelectionReview,
    closeSelectionReview,
    moveReview,
    removeReviewPhoto,
    restoreReviewPhoto,
  };
}
