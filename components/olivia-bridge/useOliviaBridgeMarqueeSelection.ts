"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  bridgeMarqueeSelection,
  bridgeMarqueeUsesAdditiveSelection,
  bridgeRectangleFromPoints,
  bridgeRectanglesIntersect,
  type BridgePoint,
  type BridgeRectangle,
} from "@/lib/photo-bridge/marqueeSelection";

type MarqueeCard = {
  id: string;
  element: HTMLElement;
  rectangle: BridgeRectangle;
};

type MarqueeSession = {
  pointerId: number;
  start: BridgePoint;
  current: BridgePoint;
  additive: boolean;
  initialSelection: Set<string>;
  currentSelection: Set<string>;
  started: boolean;
  cards: MarqueeCard[];
};

type UseOliviaBridgeMarqueeSelectionOptions = {
  selectedIds: ReadonlySet<string>;
  visibleJpgs: readonly BridgeJpgFile[];
  onCommit: (selection: Set<string>, focusedId: string | null) => void;
};

export function useOliviaBridgeMarqueeSelection({
  selectedIds,
  visibleJpgs,
  onCommit,
}: UseOliviaBridgeMarqueeSelectionOptions) {
  const fileAreaRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<MarqueeSession | null>(null);
  const frameRef = useRef<number | null>(null);
  const suppressThumbnailClickRef = useRef(false);

  const clearPresentation = useCallback(() => {
    const fileArea = fileAreaRef.current;
    const marquee = marqueeRef.current;
    if (marquee) marquee.style.display = "none";
    if (!fileArea) return;
    delete fileArea.dataset.marqueeActive;
    fileArea.querySelectorAll<HTMLElement>("[data-bridge-photo-id]").forEach((element) => {
      delete element.dataset.marqueeSelected;
    });
  }, []);

  const paint = useCallback(() => {
    const session = sessionRef.current;
    const fileArea = fileAreaRef.current;
    const marquee = marqueeRef.current;
    if (!session || !fileArea || !marquee || !session.started) return;
    const rectangle = bridgeRectangleFromPoints(session.start, session.current);
    const hits = new Set(session.cards
      .filter((card) => bridgeRectanglesIntersect(rectangle, card.rectangle))
      .map((card) => card.id));
    const selection = bridgeMarqueeSelection({
      initial: session.initialSelection,
      hits,
      additive: session.additive,
    });
    session.currentSelection = selection;
    for (const card of session.cards) {
      card.element.dataset.marqueeSelected = selection.has(card.id) ? "true" : "false";
    }

    const areaBounds = fileArea.getBoundingClientRect();
    marquee.style.display = "block";
    marquee.style.width = `${rectangle.right - rectangle.left}px`;
    marquee.style.height = `${rectangle.bottom - rectangle.top}px`;
    marquee.style.transform = `translate3d(${rectangle.left - areaBounds.left + fileArea.scrollLeft}px, ${rectangle.top - areaBounds.top + fileArea.scrollTop}px, 0)`;
  }, []);

  const schedulePaint = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paint();
    });
  }, [paint]);

  const end = useCallback((event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    session.current = { x: event.clientX, y: event.clientY };
    if (session.started) paint();
    if (commit && session.started) {
      const nextSelection = new Set(session.currentSelection);
      const nextFocused = visibleJpgs.find((photo) => nextSelection.has(photo.id)) ?? null;
      onCommit(nextSelection, nextFocused?.id ?? null);
      suppressThumbnailClickRef.current = true;
      setTimeout(() => {
        suppressThumbnailClickRef.current = false;
      }, 0);
    }
    sessionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    requestAnimationFrame(clearPresentation);
  }, [clearPresentation, onCommit, paint, visibleJpgs]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType !== "mouse") return;
    sessionRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      additive: bridgeMarqueeUsesAdditiveSelection(event),
      initialSelection: new Set(selectedIds),
      currentSelection: new Set(selectedIds),
      started: false,
      cards: [],
    };
  }, [selectedIds]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.current = { x: event.clientX, y: event.clientY };
    if (!session.started) {
      const distance = Math.hypot(session.current.x - session.start.x, session.current.y - session.start.y);
      if (distance < 6) return;
      session.started = true;
      const fileArea = event.currentTarget;
      fileArea.setPointerCapture(event.pointerId);
      fileArea.dataset.marqueeActive = "true";
      session.cards = Array.from(fileArea.querySelectorAll<HTMLElement>("[data-bridge-photo-id]"))
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            id: element.dataset.bridgePhotoId ?? "",
            element,
            rectangle: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
          };
        })
        .filter((card) => Boolean(card.id));
    }
    event.preventDefault();
    schedulePaint();
  }, [schedulePaint]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    end(event, true);
  }, [end]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    end(event, false);
  }, [end]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  return {
    fileAreaRef,
    marqueeRef,
    suppressThumbnailClickRef,
    handleFileAreaPointerDown: handlePointerDown,
    handleFileAreaPointerMove: handlePointerMove,
    handleFileAreaPointerUp: handlePointerUp,
    handleFileAreaPointerCancel: handlePointerCancel,
  };
}
