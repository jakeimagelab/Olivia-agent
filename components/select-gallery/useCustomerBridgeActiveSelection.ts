"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { addCustomerBridgeRange } from "@/lib/select-gallery/customerBridge";
import {
  bridgeMarqueeSelection,
  bridgeMarqueeUsesAdditiveSelection,
  bridgeRectangleFromPoints,
  bridgeRectanglesIntersect,
} from "@/lib/photo-bridge/marqueeSelection";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { CustomerBridgeSelectionModifiers } from "./CustomerBridgeMedia";

export function customerBridgeClickSelection({
  current,
  imageId,
  orderedIds,
  anchorId,
  modifiers,
}: {
  current: ReadonlySet<string>;
  imageId: string;
  orderedIds: readonly string[];
  anchorId: string | null;
  modifiers: CustomerBridgeSelectionModifiers;
}) {
  if (modifiers.shiftKey && anchorId) {
    return {
      activeImageIds: addCustomerBridgeRange({ current, orderedIds, anchorId, targetId: imageId }),
      anchorId,
    };
  }
  if (modifiers.metaKey || modifiers.ctrlKey) {
    const activeImageIds = new Set(current);
    if (activeImageIds.has(imageId)) activeImageIds.delete(imageId);
    else activeImageIds.add(imageId);
    return { activeImageIds, anchorId: imageId };
  }
  return { activeImageIds: new Set([imageId]), anchorId: imageId };
}

export function useCustomerBridgeActiveSelection({
  orderedIds,
  mobile,
  readOnly,
  gridRef,
  onMobileOpen,
}: {
  orderedIds: readonly string[];
  mobile: boolean;
  readOnly: boolean;
  gridRef: RefObject<HTMLDivElement | null>;
  onMobileOpen: (imageId: string) => void;
}) {
  const [focusedImageId, setFocusedImageId] = useState<string | null>(null);
  const [activeImageIds, setActiveImageIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const pointerRef = useRef<{
    start: { x: number; y: number };
    initial: Set<string>;
    additive: boolean;
  } | null>(null);

  const resetLocationSelection = useCallback((nextImages: readonly CustomerBridgeImage[]) => {
    setFocusedImageId(nextImages[0]?.id ?? null);
    setActiveImageIds(new Set());
    setAnchorId(null);
  }, []);

  const clearActiveSelection = useCallback(() => {
    setActiveImageIds(new Set());
    setAnchorId(null);
  }, []);

  const handlePhotoClick = useCallback((image: CustomerBridgeImage, modifiers: CustomerBridgeSelectionModifiers) => {
    setFocusedImageId(image.id);
    if (mobile) {
      onMobileOpen(image.id);
      return;
    }
    setActiveImageIds((current) => customerBridgeClickSelection({
      current,
      imageId: image.id,
      orderedIds,
      anchorId,
      modifiers,
    }).activeImageIds);
    setAnchorId(modifiers.shiftKey && anchorId ? anchorId : image.id);
  }, [anchorId, mobile, onMobileOpen, orderedIds]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || mobile || event.button !== 0 || (event.target as HTMLElement).closest("button,[data-bridge-card]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      start: {
        x: event.clientX - rect.left + event.currentTarget.scrollLeft,
        y: event.clientY - rect.top + event.currentTarget.scrollTop,
      },
      initial: new Set(activeImageIds),
      additive: bridgeMarqueeUsesAdditiveSelection(event),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [activeImageIds, mobile, readOnly]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    const root = gridRef.current;
    if (!pointer || !root) return;
    const rect = root.getBoundingClientRect();
    const end = {
      x: event.clientX - rect.left + root.scrollLeft,
      y: event.clientY - rect.top + root.scrollTop,
    };
    const box = bridgeRectangleFromPoints(pointer.start, end);
    setMarquee({ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top });
    const hits = new Set<string>();
    root.querySelectorAll<HTMLElement>("[data-bridge-image-id]").forEach((node) => {
      const nodeRect = node.getBoundingClientRect();
      const candidate = {
        left: nodeRect.left - rect.left + root.scrollLeft,
        top: nodeRect.top - rect.top + root.scrollTop,
        right: nodeRect.right - rect.left + root.scrollLeft,
        bottom: nodeRect.bottom - rect.top + root.scrollTop,
      };
      if (bridgeRectanglesIntersect(box, candidate)) hits.add(node.dataset.bridgeImageId ?? "");
    });
    setActiveImageIds(bridgeMarqueeSelection({ initial: pointer.initial, hits, additive: pointer.additive }));
  }, [gridRef]);

  const handlePointerUp = useCallback(() => {
    pointerRef.current = null;
    setMarquee(null);
  }, []);

  return {
    focusedImageId,
    setFocusedImageId,
    activeImageIds,
    setActiveImageIds,
    anchorId,
    setAnchorId,
    marquee,
    resetLocationSelection,
    clearActiveSelection,
    handlePhotoClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
