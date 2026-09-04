"use client";

import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { DESKTOP_DOCK_SAFE_AREA, useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { computeSnapZone, resolveSnapBounds } from "./snapZones";

const MIN_VISIBLE_HEADER = 40;
const EDGE_GAP = 12;

export type ResizeHandle = "e" | "s" | "se";

export function useWindowInteractions(
  windowId: string,
  minWidth: number,
  minHeight: number,
  workspaceRef: RefObject<HTMLDivElement | null>,
  setInteracting: Dispatch<SetStateAction<boolean>>,
) {
  const moveWindow = useOliviaDesktopStore((state) => state.moveWindow);
  const resizeWindow = useOliviaDesktopStore((state) => state.resizeWindow);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const snapWindow = useOliviaDesktopStore((state) => state.snapWindow);
  const unsnapWindow = useOliviaDesktopStore((state) => state.unsnapWindow);
  const setDragHint = useOliviaDesktopStore((state) => state.setDragHint);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const beginDrag = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    cleanupRef.current?.();
    const workspace = workspaceRef.current;
    const win = useOliviaDesktopStore.getState().windows[windowId];
    if (!workspace || !win) return;

    focusWindow(windowId);
    setInteracting(true);
    const captureTarget = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId;
    try { captureTarget.setPointerCapture(pointerId); } catch { /* best effort */ }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const workspaceRect = workspace.getBoundingClientRect();
    const localStartX = event.clientX - workspaceRect.left;
    const localStartY = event.clientY - workspaceRect.top;
    let originX = win.x;
    let originY = win.y;
    let originWidth = win.width;
    let originHeight = win.height;

    if (win.snapMode !== "none") {
      const restored = win.previousBounds ?? { x: win.x, y: win.y, width: minWidth * 1.5, height: minHeight * 1.5 };
      originWidth = Math.min(restored.width, workspaceRect.width * 0.82);
      originHeight = Math.min(restored.height, (workspaceRect.height - DESKTOP_DOCK_SAFE_AREA) * 0.82);
      originX = localStartX - originWidth / 2;
      originY = Math.max(0, localStartY - 16);
      unsnapWindow(windowId);
      moveWindow(windowId, originX, originY);
      resizeWindow(windowId, originWidth, originHeight);
    }

    let finished = false;
    const finish = (applySnap: boolean) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      try {
        if (captureTarget.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId);
      } catch { /* the element may already be detached */ }
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      setInteracting(false);
      const hint = useOliviaDesktopStore.getState().dragHint;
      if (applySnap && hint) {
        const bounds = resolveSnapBounds(hint, workspace.clientWidth, workspace.clientHeight, DESKTOP_DOCK_SAFE_AREA);
        snapWindow(windowId, hint, bounds);
      }
      setDragHint(null);
      cleanupRef.current = null;
    };
    const move = (pointerEvent: PointerEvent) => {
      const localX = pointerEvent.clientX - workspaceRect.left;
      const localY = pointerEvent.clientY - workspaceRect.top;
      const nextX = Math.max(-(originWidth - MIN_VISIBLE_HEADER), Math.min(workspaceRect.width - MIN_VISIBLE_HEADER, originX + localX - localStartX));
      const nextY = Math.max(0, Math.min(workspaceRect.height - MIN_VISIBLE_HEADER, originY + localY - localStartY));
      moveWindow(windowId, Math.round(nextX), Math.round(nextY));
      setDragHint(computeSnapZone(localX, localY, workspaceRect.width, workspaceRect.height));
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    cleanupRef.current = () => finish(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [focusWindow, minHeight, minWidth, moveWindow, resizeWindow, setDragHint, setInteracting, snapWindow, unsnapWindow, windowId, workspaceRef]);

  const beginResize = useCallback((event: React.PointerEvent, handle: ResizeHandle) => {
    event.preventDefault();
    event.stopPropagation();
    cleanupRef.current?.();
    const workspace = workspaceRef.current;
    const win = useOliviaDesktopStore.getState().windows[windowId];
    if (!workspace || !win || win.snapMode !== "none") return;

    focusWindow(windowId);
    setInteracting(true);
    const captureTarget = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId;
    try { captureTarget.setPointerCapture(pointerId); } catch { /* best effort */ }
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = handle === "e" ? "ew-resize" : handle === "s" ? "ns-resize" : "nwse-resize";

    const startX = event.clientX;
    const startY = event.clientY;
    const originWidth = win.width;
    const originHeight = win.height;
    const maxWidth = Math.max(minWidth, workspace.clientWidth - win.x - EDGE_GAP);
    const maxHeight = Math.max(minHeight, workspace.clientHeight - DESKTOP_DOCK_SAFE_AREA - win.y - EDGE_GAP);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      try {
        if (captureTarget.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId);
      } catch { /* the element may already be detached */ }
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      setInteracting(false);
      cleanupRef.current = null;
    };
    const move = (pointerEvent: PointerEvent) => {
      const dx = pointerEvent.clientX - startX;
      const dy = pointerEvent.clientY - startY;
      const nextWidth = handle === "s" ? originWidth : Math.min(maxWidth, Math.max(minWidth, originWidth + dx));
      const nextHeight = handle === "e" ? originHeight : Math.min(maxHeight, Math.max(minHeight, originHeight + dy));
      resizeWindow(windowId, Math.round(nextWidth), Math.round(nextHeight));
    };
    cleanupRef.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }, [focusWindow, minHeight, minWidth, resizeWindow, setInteracting, windowId, workspaceRef]);

  return { beginDrag, beginResize };
}
