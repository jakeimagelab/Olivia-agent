"use client";

import { useCallback } from "react";
import { useOliviaDesktopStore, DESKTOP_TOPBAR_HEIGHT } from "@/lib/store/useOliviaDesktopStore";

// components/reviews/ReviewStoryCanvas.tsx의 beginPointerAction 패턴을 일반화했다 — pointerdown에서
// 시작점을 기록하고 window에 pointermove/pointerup을 붙여 델타를 계산한 뒤 pointerup에서 정리하는
// 구조가 그대로다. 캔버스 좌표 스케일(scale)이 없다는 점만 다르다.
const MIN_VISIBLE_HEADER = 40;

export type ResizeHandle = "e" | "s" | "se";

export function useWindowInteractions(windowId: string, minWidth: number, minHeight: number) {
  const moveWindow = useOliviaDesktopStore((state) => state.moveWindow);
  const resizeWindow = useOliviaDesktopStore((state) => state.resizeWindow);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);

  const beginDrag = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    focusWindow(windowId);
    const win = useOliviaDesktopStore.getState().windows[windowId];
    if (!win || win.maximized) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = win.x;
    const originY = win.y;
    const move = (pointerEvent: PointerEvent) => {
      const dx = pointerEvent.clientX - startX;
      const dy = pointerEvent.clientY - startY;
      // 화면 밖으로 완전히 사라지지 않게 — 헤더 일부는 항상 viewport 안(Top Bar 아래)에 남긴다.
      const nextX = Math.max(-(win.width - MIN_VISIBLE_HEADER), Math.min(window.innerWidth - MIN_VISIBLE_HEADER, originX + dx));
      const nextY = Math.max(DESKTOP_TOPBAR_HEIGHT, Math.min(window.innerHeight - MIN_VISIBLE_HEADER, originY + dy));
      moveWindow(windowId, Math.round(nextX), Math.round(nextY));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }, [windowId, moveWindow, focusWindow]);

  // Phase 1 최소 요구치(스펙 1-8): e(오른쪽)/s(아래)/se(오른쪽아래) 3방향만. 8방향은 다음 단계.
  const beginResize = useCallback((event: React.PointerEvent, handle: ResizeHandle) => {
    event.preventDefault();
    event.stopPropagation();
    focusWindow(windowId);
    const win = useOliviaDesktopStore.getState().windows[windowId];
    if (!win || win.maximized) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const originWidth = win.width;
    const originHeight = win.height;
    const move = (pointerEvent: PointerEvent) => {
      const dx = pointerEvent.clientX - startX;
      const dy = pointerEvent.clientY - startY;
      const nextWidth = handle === "s" ? originWidth : Math.max(minWidth, originWidth + dx);
      const nextHeight = handle === "e" ? originHeight : Math.max(minHeight, originHeight + dy);
      resizeWindow(windowId, Math.round(nextWidth), Math.round(nextHeight));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }, [windowId, minWidth, minHeight, resizeWindow, focusWindow]);

  return { beginDrag, beginResize };
}
