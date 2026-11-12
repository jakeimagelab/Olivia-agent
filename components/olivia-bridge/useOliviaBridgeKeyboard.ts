"use client";

import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { BridgeToolKey } from "@/components/olivia-bridge/OliviaBridgeActionBar";
import type { BridgeGridDirection } from "@/lib/photo-bridge/gridNavigation";
import type { BridgeColorLabel } from "@/lib/photo-bridge/labels";

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function isSpaceShortcutTarget(target: EventTarget | null, root: HTMLDivElement) {
  return target === root || (target instanceof HTMLElement && Boolean(target.closest("[data-bridge-photo-id]")));
}

type UseOliviaBridgeKeyboardOptions = {
  compactFiltersOpen: boolean;
  closeCompactFilters: () => void;
  dialogOpen: boolean;
  closeDialogs: () => void;
  handleSearchFilterShortcut: (event: ReactKeyboardEvent<HTMLDivElement>) => boolean;
  resizeThumbnails: (direction: -1 | 1) => void;
  toolKey?: BridgeToolKey;
  sceneReviewOpen: boolean;
  selectionReviewOpen: boolean;
  fullscreenPreviewOpen: boolean;
  openSelectionReview: () => void;
  closeSelectionReview: () => void;
  closeFullscreenPreview: () => void;
  moveFullscreenPreview: (delta: number) => void;
  moveReview: (delta: -1 | 1) => void;
  removeReviewPhoto: () => void;
  restoreReviewPhoto: () => void;
  openFullscreenPreview: () => void;
  applyRating: (rating: number, focusedOnly?: boolean) => void;
  applyColorLabel: (label: BridgeColorLabel, focusedOnly?: boolean) => void;
  toggleExcluded: (focusedOnly?: boolean) => void;
  closeSceneReview: () => void;
  closeTool: () => void;
  selectAllVisibleJpgs: () => void;
  moveGridFocus: (direction: BridgeGridDirection, extendRange?: boolean) => void;
};

export function useOliviaBridgeKeyboard({
  compactFiltersOpen,
  closeCompactFilters,
  dialogOpen,
  closeDialogs,
  handleSearchFilterShortcut,
  resizeThumbnails,
  toolKey,
  sceneReviewOpen,
  selectionReviewOpen,
  fullscreenPreviewOpen,
  openSelectionReview,
  closeSelectionReview,
  closeFullscreenPreview,
  moveFullscreenPreview,
  moveReview,
  removeReviewPhoto,
  restoreReviewPhoto,
  openFullscreenPreview,
  applyRating,
  applyColorLabel,
  toggleExcluded,
  closeSceneReview,
  closeTool,
  selectAllVisibleJpgs,
  moveGridFocus,
}: UseOliviaBridgeKeyboardOptions) {
  return useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && compactFiltersOpen) {
      event.preventDefault();
      closeCompactFilters();
      return;
    }
    if (event.key === "Escape" && dialogOpen) {
      event.preventDefault();
      closeDialogs();
      return;
    }
    if (handleSearchFilterShortcut(event)) return;
    if (event.metaKey && !event.altKey && !event.ctrlKey) {
      if (event.code === "Equal" || event.key === "+" || event.key === "=") {
        event.preventDefault();
        resizeThumbnails(1);
        return;
      }
      if (event.code === "Minus" || event.key === "-" || event.key === "_") {
        event.preventDefault();
        resizeThumbnails(-1);
        return;
      }
    }
    if (isTypingTarget(event.target)) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === "KeyB") {
      event.preventDefault();
      if (!toolKey && !sceneReviewOpen && !selectionReviewOpen) openSelectionReview();
      return;
    }
    if (fullscreenPreviewOpen) {
      if (event.key === "Escape" || event.key === " ") {
        event.preventDefault();
        closeFullscreenPreview();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveFullscreenPreview(-1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveFullscreenPreview(1);
      } else if (/^[0-5]$/.test(event.key)) {
        event.preventDefault();
        applyRating(Number(event.key), true);
      } else if (/^[6-9]$/.test(event.key)) {
        event.preventDefault();
        applyColorLabel(Number(event.key) as BridgeColorLabel, true);
      } else if (event.key.toLocaleLowerCase("en-US") === "x") {
        event.preventDefault();
        toggleExcluded(true);
      }
      return;
    }
    if (selectionReviewOpen) {
      if (event.key === "Escape") { event.preventDefault(); closeSelectionReview(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); moveReview(-1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); moveReview(1); }
      else if (event.key === "ArrowDown") { event.preventDefault(); removeReviewPhoto(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); restoreReviewPhoto(); }
      else if (event.key === " ") { event.preventDefault(); openFullscreenPreview(); }
      else if (/^[0-5]$/.test(event.key)) { event.preventDefault(); applyRating(Number(event.key), true); }
      else if (/^[6-9]$/.test(event.key)) { event.preventDefault(); applyColorLabel(Number(event.key) as BridgeColorLabel, true); }
      else if (event.key.toLocaleLowerCase("en-US") === "x") { event.preventDefault(); toggleExcluded(true); }
      return;
    }
    if (event.key === "Escape") {
      if (sceneReviewOpen) closeSceneReview();
      else if (toolKey) closeTool();
      return;
    }
    if (toolKey || sceneReviewOpen) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === "KeyA") { event.preventDefault(); selectAllVisibleJpgs(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); moveGridFocus("left", event.shiftKey); }
    else if (event.key === "ArrowRight") { event.preventDefault(); moveGridFocus("right", event.shiftKey); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveGridFocus("up", event.shiftKey); }
    else if (event.key === "ArrowDown") { event.preventDefault(); moveGridFocus("down", event.shiftKey); }
    else if (event.key === " " && isSpaceShortcutTarget(event.target, event.currentTarget)) { event.preventDefault(); openFullscreenPreview(); }
    else if (/^[0-5]$/.test(event.key)) applyRating(Number(event.key));
    else if (/^[6-9]$/.test(event.key)) applyColorLabel(Number(event.key) as BridgeColorLabel);
    else if (event.key.toLocaleLowerCase("en-US") === "x" || (event.altKey && event.key === "Delete")) { event.preventDefault(); toggleExcluded(); }
  }, [applyColorLabel, applyRating, closeCompactFilters, closeDialogs, closeFullscreenPreview, closeSceneReview, closeSelectionReview, closeTool, compactFiltersOpen, dialogOpen, fullscreenPreviewOpen, handleSearchFilterShortcut, moveFullscreenPreview, moveGridFocus, moveReview, openFullscreenPreview, openSelectionReview, removeReviewPhoto, resizeThumbnails, restoreReviewPhoto, sceneReviewOpen, selectAllVisibleJpgs, selectionReviewOpen, toggleExcluded, toolKey]);
}
