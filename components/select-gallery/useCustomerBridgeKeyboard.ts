"use client";

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  addCustomerBridgeRange,
  customerBridgeRatingTargets,
  type CustomerBridgeColorLabel,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import {
  customerBridgeGridNavigationTarget,
  resolveCustomerBridgeKeyboardCommand,
} from "@/lib/select-gallery/customerBridgeKeyboard";

export { customerBridgeGridNavigationTarget } from "@/lib/select-gallery/customerBridgeKeyboard";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
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
  const keydownHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keydownHandlerRef.current = (event: KeyboardEvent) => {
      if (guideOpen || resetConfirmOpen) {
        const modalCommand = resolveCustomerBridgeKeyboardCommand({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          guideOpen,
          resetConfirmOpen,
          mobileSideOpen,
          fullscreenId,
          reviewOpen: Boolean(reviewIds),
          reviewActiveId,
          reviewCanRestore: Boolean(reviewRemoved),
          focusedImageId,
          readOnly,
        });
        if (modalCommand?.type === "close-guide") {
          event.preventDefault();
          closeGuide();
        } else if (modalCommand?.type === "close-reset") {
          event.preventDefault();
          closeResetConfirm();
        }
        return;
      }
      if (handleSearchFilterShortcut(event)) return;
      if (event.isComposing || isTypingTarget(event.target)) return;
      const command = resolveCustomerBridgeKeyboardCommand({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        guideOpen,
        resetConfirmOpen,
        mobileSideOpen,
        fullscreenId,
        reviewOpen: Boolean(reviewIds),
        reviewActiveId,
        reviewCanRestore: Boolean(reviewRemoved),
        focusedImageId,
        readOnly,
      });
      if (!command || command.type === "blocked") return;

      if (command.type === "close-fullscreen") {
        closeFullscreen();
        return;
      }
      if (command.type === "close-review") {
        closeReview();
        return;
      }
      if (command.type === "close-mobile-side") {
        setMobileSideOpen(false);
        return;
      }
      if (command.type === "close-folders") {
        setCompactFoldersOpen(false);
        return;
      }
      if (command.type === "open-review") {
        event.preventDefault();
        openReview();
        return;
      }
      if (command.type === "open-fullscreen") {
        event.preventDefault();
        openFullscreen(command.imageId);
        return;
      }
      if (command.type === "apply-mark") {
        const value = command.value;
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
      if (command.type === "move-review") {
        if (!reviewIds?.length) return;
        event.preventDefault();
        moveReview(command.delta);
        return;
      }
      if (command.type === "remove-review-image") {
        event.preventDefault();
        removeFromReview(command.imageId);
        return;
      }
      if (command.type === "restore-review-image") {
        event.preventDefault();
        restoreReview();
        return;
      }
      if (command.type === "move-fullscreen") {
        event.preventDefault();
        moveFullscreen(command.delta);
        return;
      }
      if (command.type !== "move-grid" || !focusedImageId) return;
      const columns = Math.max(1, Math.floor((gridRef.current?.clientWidth ?? thumbSize) / (thumbSize + 10)));
      const nextId = customerBridgeGridNavigationTarget({ orderedIds, currentId: focusedImageId, key: command.key, columns });
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keydownHandlerRef.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
