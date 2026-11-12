"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  BRIDGE_PANE_DEFAULT_WIDTH,
  bridgePaneWidthFromPointer,
  clampBridgePaneWidth,
  type BridgeResizablePane,
} from "@/lib/photo-bridge/paneLayout";
import styles from "./OliviaBridgeWorkspace.module.css";

const BRIDGE_PANE_STORAGE_KEY = "olivia-bridge:pane-widths";

function readStoredPaneWidth(pane: BridgeResizablePane) {
  try {
    const stored = JSON.parse(localStorage.getItem(BRIDGE_PANE_STORAGE_KEY) ?? "{}") as Partial<Record<BridgeResizablePane, number>>;
    return typeof stored[pane] === "number" ? stored[pane] : BRIDGE_PANE_DEFAULT_WIDTH[pane];
  } catch {
    return BRIDGE_PANE_DEFAULT_WIDTH[pane];
  }
}

function storePaneWidth(pane: BridgeResizablePane, width: number) {
  try {
    const stored = JSON.parse(localStorage.getItem(BRIDGE_PANE_STORAGE_KEY) ?? "{}") as Partial<Record<BridgeResizablePane, number>>;
    localStorage.setItem(BRIDGE_PANE_STORAGE_KEY, JSON.stringify({ ...stored, [pane]: width }));
  } catch (error) {
    void error;
  }
}

export function BridgePaneDivider({
  pane,
  workspaceRef,
  oppositePaneRef,
  controls,
  label,
}: {
  pane: BridgeResizablePane;
  workspaceRef: RefObject<HTMLElement | null>;
  oppositePaneRef: RefObject<HTMLElement | null>;
  controls: string;
  label: string;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const widthRef = useRef(BRIDGE_PANE_DEFAULT_WIDTH[pane]);
  const scheduledWidthRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [width, setWidth] = useState(BRIDGE_PANE_DEFAULT_WIDTH[pane]);
  const [dragging, setDragging] = useState(false);

  const applyWidth = useCallback((requestedWidth: number) => {
    const workspace = workspaceRef.current;
    if (!workspace) return widthRef.current;
    const nextWidth = clampBridgePaneWidth({
      pane,
      requestedWidth,
      containerWidth: workspace.getBoundingClientRect().width,
      oppositePaneWidth: oppositePaneRef.current?.getBoundingClientRect().width ?? BRIDGE_PANE_DEFAULT_WIDTH[pane === "folder" ? "preview" : "folder"],
    });
    workspace.style.setProperty(pane === "folder" ? "--bridge-folder-width" : "--bridge-preview-width", `${nextWidth}px`);
    widthRef.current = nextWidth;
    setWidth(nextWidth);
    return nextWidth;
  }, [oppositePaneRef, pane, workspaceRef]);

  const flushScheduledWidth = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    const requestedWidth = scheduledWidthRef.current;
    scheduledWidthRef.current = null;
    return requestedWidth === null ? widthRef.current : applyWidth(requestedWidth);
  }, [applyWidth]);

  const scheduleWidth = useCallback((requestedWidth: number) => {
    scheduledWidthRef.current = requestedWidth;
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const nextWidth = scheduledWidthRef.current;
      scheduledWidthRef.current = null;
      if (nextWidth !== null) applyWidth(nextWidth);
    });
  }, [applyWidth]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const frame = requestAnimationFrame(() => applyWidth(readStoredPaneWidth(pane)));
    const observer = new ResizeObserver(() => {
      if (workspace.getBoundingClientRect().width <= 760) return;
      applyWidth(widthRef.current);
    });
    observer.observe(workspace);
    return () => {
      cancelAnimationFrame(frame);
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      observer.disconnect();
    };
  }, [applyWidth, pane, workspaceRef]);

  const widthFromPointer = useCallback((clientX: number) => {
    const workspace = workspaceRef.current;
    if (!workspace) return widthRef.current;
    const bounds = workspace.getBoundingClientRect();
    return bridgePaneWidthFromPointer({
      pane,
      pointerX: clientX,
      containerLeft: bounds.left,
      containerRight: bounds.right,
    });
  }, [pane, workspaceRef]);

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const finalWidth = flushScheduledWidth();
    pointerIdRef.current = null;
    setDragging(false);
    storePaneWidth(pane, finalWidth);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [flushScheduledWidth, pane]);

  return (
    <div
      className={`${styles.paneDivider} ${dragging ? styles.paneDividerDragging : ""}`}
      role="separator"
      aria-label={label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={pane === "folder" ? 150 : 240}
      aria-valuemax={pane === "folder" ? 360 : 560}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        pointerIdRef.current = event.pointerId;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        scheduleWidth(widthFromPointer(event.clientX));
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current !== event.pointerId) return;
        scheduleWidth(widthFromPointer(event.clientX));
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onDoubleClick={() => {
        const nextWidth = applyWidth(BRIDGE_PANE_DEFAULT_WIDTH[pane]);
        storePaneWidth(pane, nextWidth);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const delta = pane === "folder" ? direction * 24 : direction * -24;
        const nextWidth = applyWidth(widthRef.current + delta);
        storePaneWidth(pane, nextWidth);
      }}
    />
  );
}
