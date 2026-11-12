"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { isVirtualGridNearEnd, virtualGridRange, virtualGridScrollTop } from "@/lib/select-gallery/virtualGrid";

const INITIAL_RENDER_COUNT = 72;

function measuredColumns(grid: HTMLDivElement, mobile: boolean) {
  if (mobile) return 2;
  const template = window.getComputedStyle(grid).gridTemplateColumns;
  return Math.max(1, template.split(" ").filter(Boolean).length);
}

export function useVirtualPhotoGrid<T>({
  items,
  containerRef,
  gridRef,
  thumbSize,
  mobile,
  resetKey,
  onNearEnd,
}: {
  items: readonly T[];
  containerRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  thumbSize: number;
  mobile: boolean;
  resetKey: string;
  onNearEnd?: () => void;
}) {
  const frameRef = useRef<number | null>(null);
  const onNearEndRef = useRef(onNearEnd);
  onNearEndRef.current = onNearEnd;
  const layoutRef = useRef({ columns: mobile ? 2 : 4, rowHeight: thumbSize + 44, gridOffsetTop: 0 });
  const [range, setRange] = useState(() => ({
    start: 0,
    end: Math.min(items.length, INITIAL_RENDER_COUNT),
    topPadding: 0,
    bottomPadding: 0,
    rowCount: Math.ceil(items.length / 4),
    totalHeight: 0,
  }));

  const measure = useCallback(() => {
    const container = containerRef.current;
    const grid = gridRef.current;
    if (!container || !grid) {
      setRange({
        start: 0,
        end: Math.min(items.length, INITIAL_RENDER_COUNT),
        topPadding: 0,
        bottomPadding: 0,
        rowCount: Math.ceil(items.length / 4),
        totalHeight: 0,
      });
      return;
    }
    const columns = measuredColumns(grid, mobile);
    const firstCard = grid.querySelector<HTMLElement>("[data-bridge-card]");
    const gap = mobile ? 5 : 10;
    const estimatedWidth = mobile
      ? Math.max(1, (grid.clientWidth - gap) / 2)
      : Math.max(thumbSize, (grid.clientWidth - gap * (columns - 1)) / columns);
    const rowHeight = (firstCard?.getBoundingClientRect().height || estimatedWidth + 34) + gap;
    layoutRef.current = { columns, rowHeight, gridOffsetTop: grid.offsetTop };
    const nextRange = virtualGridRange({
      itemCount: items.length,
      columns,
      rowHeight,
      scrollTop: container.scrollTop,
      viewportHeight: container.clientHeight,
      gridOffsetTop: grid.offsetTop,
    });
    if (isVirtualGridNearEnd({
      end: nextRange.end,
      itemCount: items.length,
      columns,
    })) onNearEndRef.current?.();
    setRange((current) => current.start === nextRange.start
      && current.end === nextRange.end
      && current.topPadding === nextRange.topPadding
      && current.bottomPadding === nextRange.bottomPadding
      && current.totalHeight === nextRange.totalHeight
      ? current
      : nextRange);
  }, [containerRef, gridRef, items.length, mobile, thumbSize]);

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    const container = containerRef.current;
    const grid = gridRef.current;
    if (!container || !grid) return;
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(container);
    observer.observe(grid);
    container.addEventListener("scroll", scheduleMeasure, { passive: true });
    scheduleMeasure();
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", scheduleMeasure);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [containerRef, gridRef, scheduleMeasure]);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
    scheduleMeasure();
  }, [containerRef, resetKey, scheduleMeasure]);

  useEffect(() => { scheduleMeasure(); }, [items.length, scheduleMeasure, thumbSize]);

  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container || index < 0) return;
    container.scrollTo({
      top: virtualGridScrollTop({ index, ...layoutRef.current }),
      behavior: "auto",
    });
  }, [containerRef]);

  return useMemo(() => ({
    renderedItems: items.slice(range.start, range.end),
    startIndex: range.start,
    endIndex: range.end,
    topPadding: range.topPadding,
    bottomPadding: range.bottomPadding,
    totalHeight: range.totalHeight,
    scrollToIndex,
  }), [items, range, scrollToIndex]);
}
