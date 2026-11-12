"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  addCustomerBridgeRange,
  customerBridgeRatingTargets,
  type CustomerBridgeColorLabel,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function customerBridgeGridNavigationTarget({
  orderedIds,
  currentId,
  key,
  columns,
}: {
  orderedIds: readonly string[];
  currentId: string;
  key: string;
  columns: number;
}) {
  const currentIndex = orderedIds.indexOf(currentId);
  if (currentIndex < 0 || !key.startsWith("Arrow")) return null;
  const safeColumns = Math.max(1, columns);
  const delta = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -safeColumns : safeColumns;
  return orderedIds[Math.max(0, Math.min(orderedIds.length - 1, currentIndex + delta))] ?? null;
}

export function useCustomerBridgeKeyboard({
  guideOpen,
  resetConfirmOpen,
  mobileSideOpen,
  closeGuide,
  closeResetConfirm,
  handleSearchFilterShortcut,
  fullscreenId,
  closeFullscreen,
  openFullscreen,
  moveFullscreen,
  reviewIds,
  reviewActiveId,
  reviewRemoved,
  openReview,
  closeReview,
  moveReview,
  removeFromReview,
  restoreReview,
  readOnly,
  activeImageIds,
  focusedImageId,
  orderedIds,
  anchorId,
  customerRatings,
  customerColorLabels,
  applyRatingTo,
  toggleColorTo,
  setActiveImageIds,
  setAnchorId,
  setFocusedImageId,
  setMobileSideOpen,
  setCompactFoldersOpen,
  gridRef,
  thumbSize,
}: {
  guideOpen: boolean;
  resetConfirmOpen: boolean;
  mobileSideOpen: boolean;
  closeGuide: () => void;
  closeResetConfirm: () => void;
  handleSearchFilterShortcut: (event: KeyboardEvent) => boolean;
  fullscreenId: string | null;
  closeFullscreen: () => void;
  openFullscreen: (imageId: string) => void;
  moveFullscreen: (delta: -1 | 1) => void;
  reviewIds: readonly string[] | null;
  reviewActiveId: string | null;
  reviewRemoved: unknown;
  openReview: () => void;
  closeReview: () => void;
  moveReview: (delta: -1 | 1) => void;
  removeFromReview: (imageId: string) => void;
  restoreReview: () => void;
  readOnly: boolean;
  activeImageIds: ReadonlySet<string>;
  focusedImageId: string | null;
  orderedIds: readonly string[];
  anchorId: string | null;
  customerRatings: Readonly<Record<string, CustomerBridgeRating>>;
  customerColorLabels: Readonly<Record<string, CustomerBridgeColorLabel>>;
  applyRatingTo: (targetIds: ReadonlySet<string>, rating: 0 | CustomerBridgeRating) => void;
  toggleColorTo: (targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => void;
  setActiveImageIds: Dispatch<SetStateAction<Set<string>>>;
  setAnchorId: Dispatch<SetStateAction<string | null>>;
  setFocusedImageId: Dispatch<SetStateAction<string | null>>;
  setMobileSideOpen: Dispatch<SetStateAction<boolean>>;
  setCompactFoldersOpen: Dispatch<SetStateAction<boolean>>;
  gridRef: RefObject<HTMLDivElement | null>;
  thumbSize: number;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (guideOpen || resetConfirmOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          if (guideOpen) closeGuide();
          else closeResetConfirm();
        }
        return;
      }
      if (handleSearchFilterShortcut(event)) return;
      if (event.isComposing || isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        if (fullscreenId) closeFullscreen();
        else if (reviewIds) closeReview();
        else if (mobileSideOpen) setMobileSideOpen(false);
        else setCompactFoldersOpen(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        openReview();
        return;
      }
      if (event.key === " ") {
        const fullscreenTargetId = reviewActiveId ?? focusedImageId;
        if (fullscreenTargetId) {
          event.preventDefault();
          openFullscreen(fullscreenTargetId);
          return;
        }
      }
      if (!readOnly && /^[0-9]$/.test(event.key)) {
        const value = Number(event.key);
        const targets = reviewIds && reviewActiveId
          ? new Set([reviewActiveId])
          : fullscreenId
            ? new Set([fullscreenId])
            : customerBridgeRatingTargets(activeImageIds, focusedImageId);
        if (!targets.size) return;
        event.preventDefault();
        if (value >= 6 && value <= 9) {
          const colorLabel = value as CustomerBridgeColorLabel;
          if (reviewIds && reviewActiveId && customerColorLabels[reviewActiveId] === colorLabel && !customerRatings[reviewActiveId]) {
            removeFromReview(reviewActiveId);
          } else {
            toggleColorTo(targets, colorLabel);
          }
          return;
        }
        if (value > 5) return;
        const rating = value as 0 | CustomerBridgeRating;
        if (reviewIds && reviewActiveId) {
          if (rating === 0) removeFromReview(reviewActiveId);
          else applyRatingTo(new Set([reviewActiveId]), rating);
          return;
        }
        if (fullscreenId) {
          applyRatingTo(new Set([fullscreenId]), rating);
          return;
        }
        applyRatingTo(targets, rating);
        return;
      }
      if (reviewIds) {
        if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && reviewIds.length) {
          event.preventDefault();
          moveReview(event.key === "ArrowLeft" ? -1 : 1);
        } else if (event.key === "ArrowDown" && reviewActiveId) {
          event.preventDefault();
          removeFromReview(reviewActiveId);
        } else if (event.key === "ArrowUp" && reviewRemoved) {
          event.preventDefault();
          restoreReview();
        }
        return;
      }
      if (fullscreenId && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        moveFullscreen(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (!focusedImageId || !event.key.startsWith("Arrow")) return;
      const columns = Math.max(1, Math.floor((gridRef.current?.clientWidth ?? thumbSize) / (thumbSize + 10)));
      const nextId = customerBridgeGridNavigationTarget({ orderedIds, currentId: focusedImageId, key: event.key, columns });
      if (!nextId) return;
      event.preventDefault();
      if (event.shiftKey && !readOnly) {
        setActiveImageIds((current) => addCustomerBridgeRange({
          current,
          orderedIds,
          anchorId: anchorId ?? focusedImageId,
          targetId: nextId,
        }));
      } else {
        setAnchorId(nextId);
      }
      setFocusedImageId(nextId);
      gridRef.current?.querySelector<HTMLElement>(`[data-bridge-image-id="${CSS.escape(nextId)}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeImageIds, anchorId, applyRatingTo, closeFullscreen, closeGuide, closeResetConfirm, closeReview, customerColorLabels, customerRatings, focusedImageId, fullscreenId, gridRef, guideOpen, handleSearchFilterShortcut, mobileSideOpen, moveFullscreen, moveReview, openFullscreen, openReview, orderedIds, readOnly, removeFromReview, resetConfirmOpen, restoreReview, reviewActiveId, reviewIds, reviewRemoved, setActiveImageIds, setAnchorId, setCompactFoldersOpen, setFocusedImageId, setMobileSideOpen, thumbSize, toggleColorTo]);
}
