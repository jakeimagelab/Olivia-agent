"use client";

import {
  useCallback,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  updateBridgeSelection,
  type BridgeJpgFile,
} from "@/lib/photo-bridge/bridgeFiles";
import {
  bridgeGridNavigationTarget,
  type BridgeGridDirection,
} from "@/lib/photo-bridge/gridNavigation";
import { bridgeKeyboardRangeSelection } from "@/lib/photo-bridge/reviewMode";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

type SelectionSetter = (value: Set<string> | ((current: Set<string>) => Set<string>)) => void;

type UseOliviaBridgePhotoNavigationOptions = {
  visibleJpgs: BridgeJpgFile[];
  visiblePhotoById: ReadonlyMap<string, BridgeJpgFile>;
  selectedIds: Set<string>;
  anchorId: string | null;
  focusedId: string | null;
  focusedIndex: number;
  fileAreaRef: RefObject<HTMLDivElement | null>;
  suppressThumbnailClickRef: RefObject<boolean>;
  selectionSourceRef: RefObject<BridgeSelectionSource>;
  setSelectedIds: SelectionSetter;
  setAnchorId: Dispatch<SetStateAction<string | null>>;
  setFocusedId: Dispatch<SetStateAction<string | null>>;
  setFocusedPlainId: Dispatch<SetStateAction<string | null>>;
  setPreviewSize: Dispatch<SetStateAction<{ width: number; height: number } | undefined>>;
  showAdobeSelectionNotice: () => void;
};

function isMacControlClick(event: { ctrlKey: boolean; metaKey: boolean }) {
  if (!event.ctrlKey || event.metaKey) return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function useOliviaBridgePhotoNavigation({
  visibleJpgs,
  visiblePhotoById,
  selectedIds,
  anchorId,
  focusedId,
  focusedIndex,
  fileAreaRef,
  suppressThumbnailClickRef,
  selectionSourceRef,
  setSelectedIds,
  setAnchorId,
  setFocusedId,
  setFocusedPlainId,
  setPreviewSize,
  showAdobeSelectionNotice,
}: UseOliviaBridgePhotoNavigationOptions) {
  const choosePhoto = useCallback((photo: BridgeJpgFile, event: ReactMouseEvent) => {
    const next = updateBridgeSelection({
      current: selectedIds,
      orderedIds: visibleJpgs.map((item) => item.id),
      clickedId: photo.id,
      anchorId,
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    });
    setSelectedIds(next);
    if (selectionSourceRef.current === "adobe") showAdobeSelectionNotice();
    setAnchorId(photo.id);
    setFocusedId(photo.id);
    setFocusedPlainId(null);
    setPreviewSize(undefined);
  }, [anchorId, selectedIds, selectionSourceRef, setAnchorId, setFocusedId, setFocusedPlainId, setPreviewSize, setSelectedIds, showAdobeSelectionNotice, visibleJpgs]);

  const moveFocus = useCallback((delta: number) => {
    if (!visibleJpgs.length) return;
    const current = focusedIndex >= 0 ? focusedIndex : 0;
    const nextIndex = Math.max(0, Math.min(visibleJpgs.length - 1, current + delta));
    const next = visibleJpgs[nextIndex];
    setFocusedId(next.id);
    setFocusedPlainId(null);
    setSelectedIds(new Set([next.id]));
    setAnchorId(next.id);
    setPreviewSize(undefined);
    document.querySelector<HTMLElement>(`[data-bridge-photo-id="${CSS.escape(next.id)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedIndex, setAnchorId, setFocusedId, setFocusedPlainId, setPreviewSize, setSelectedIds, visibleJpgs]);

  const moveGridFocus = useCallback((direction: BridgeGridDirection, extendRange = false) => {
    const fileArea = fileAreaRef.current;
    if (!fileArea || !visibleJpgs.length) return;
    const visibleIds = new Set(visibleJpgs.map((photo) => photo.id));
    const elements = Array.from(fileArea.querySelectorAll<HTMLElement>("[data-bridge-photo-id]"))
      .filter((element) => visibleIds.has(element.dataset.bridgePhotoId ?? ""));
    const targetId = bridgeGridNavigationTarget({
      currentId: focusedId,
      direction,
      items: elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          id: element.dataset.bridgePhotoId ?? "",
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
        };
      }).filter((item) => Boolean(item.id)),
    });
    if (!targetId || targetId === focusedId) return;
    setFocusedId(targetId);
    if (extendRange) {
      const orderedIds = visibleJpgs.map((photo) => photo.id);
      const rangeAnchor = anchorId && orderedIds.includes(anchorId)
        ? anchorId
        : focusedId && orderedIds.includes(focusedId)
          ? focusedId
          : targetId;
      setSelectedIds(bridgeKeyboardRangeSelection({ orderedIds, anchorId: rangeAnchor, targetId }));
      if (!anchorId) setAnchorId(rangeAnchor);
    } else {
      setSelectedIds(new Set([targetId]));
      setAnchorId(targetId);
    }
    setPreviewSize(undefined);
    elements.find((element) => element.dataset.bridgePhotoId === targetId)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [anchorId, fileAreaRef, focusedId, setAnchorId, setFocusedId, setPreviewSize, setSelectedIds, visibleJpgs]);

  const selectAllVisibleJpgs = useCallback(() => {
    if (!visibleJpgs.length) return;
    const next = new Set(visibleJpgs.map((photo) => photo.id));
    setSelectedIds(next);
    const nextFocusedId = focusedId && next.has(focusedId) ? focusedId : visibleJpgs[0].id;
    setFocusedId(nextFocusedId);
    setFocusedPlainId(null);
    setAnchorId(nextFocusedId);
  }, [focusedId, setAnchorId, setFocusedId, setFocusedPlainId, setSelectedIds, visibleJpgs]);

  const handleFileAreaClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressThumbnailClickRef.current) return;
    const photoCard = event.target instanceof Element
      ? event.target.closest("[data-bridge-photo-id]") as HTMLElement | null
      : null;
    if (photoCard) {
      if (isMacControlClick(event)) return;
      const photo = visiblePhotoById.get(photoCard.dataset.bridgePhotoId ?? "");
      if (photo) choosePhoto(photo, event);
      return;
    }
    setSelectedIds(new Set());
    setAnchorId(null);
    setFocusedId(null);
    setPreviewSize(undefined);
  }, [choosePhoto, setAnchorId, setFocusedId, setPreviewSize, setSelectedIds, suppressThumbnailClickRef, visiblePhotoById]);

  const handleFileAreaContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isMacControlClick(event) || !(event.target instanceof Element)) return;
    const photoCard = event.target.closest<HTMLElement>("[data-bridge-photo-id]");
    const photo = photoCard ? visiblePhotoById.get(photoCard.dataset.bridgePhotoId ?? "") : undefined;
    if (!photo) return;
    event.preventDefault();
    choosePhoto(photo, event);
  }, [choosePhoto, visiblePhotoById]);

  const toggleFocusedSelection = useCallback(() => {
    const focusedPhoto = focusedId ? visiblePhotoById.get(focusedId) : undefined;
    if (!focusedPhoto) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(focusedPhoto.id)) next.delete(focusedPhoto.id);
      else next.add(focusedPhoto.id);
      return next;
    });
  }, [focusedId, setSelectedIds, visiblePhotoById]);

  const focusPlainFile = useCallback((fileId: string) => {
    setFocusedPlainId(fileId);
    setFocusedId(null);
  }, [setFocusedId, setFocusedPlainId]);

  const handleFileAreaClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressThumbnailClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, [suppressThumbnailClickRef]);

  return {
    choosePhoto,
    moveFocus,
    moveGridFocus,
    selectAllVisibleJpgs,
    handleFileAreaClick,
    handleFileAreaContextMenu,
    handleFileAreaClickCapture,
    toggleFocusedSelection,
    focusPlainFile,
  };
}
