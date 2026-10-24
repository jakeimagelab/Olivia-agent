"use client";

import { Grip, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  BRIDGE_FLOATING_WINDOW_PRESETS,
  bridgeFloatingWindowRectsEqual,
  clampBridgeFloatingWindowRect,
  createBridgeFloatingWindowRect,
  moveBridgeFloatingWindowRect,
  resizeBridgeFloatingWindowRect,
  type BridgeFloatingWindowRect,
  type BridgeFloatingWindowResizeEdge,
} from "@/lib/photo-bridge/floatingWindow";
import styles from "./OliviaBridgeWorkspace.module.css";

type Interaction = {
  pointerId: number;
  startX: number;
  startY: number;
  startRect: BridgeFloatingWindowRect;
  mode: "move" | BridgeFloatingWindowResizeEdge;
};

type BridgeFloatingWindowProps = {
  windowId: string;
  variant: "tool" | "scene";
  title: string;
  subtitle?: string;
  ariaLabel: string;
  containerRef: RefObject<HTMLDivElement | null>;
  rect?: BridgeFloatingWindowRect;
  onRectChange: (rect: BridgeFloatingWindowRect) => void;
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

function containerBounds(container: HTMLDivElement) {
  return { width: container.clientWidth, height: container.clientHeight };
}

export function BridgeFloatingWindow({
  windowId,
  variant,
  title,
  subtitle,
  ariaLabel,
  containerRef,
  rect,
  onRectChange,
  onClose,
  className,
  children,
}: BridgeFloatingWindowProps) {
  const preset = BRIDGE_FLOATING_WINDOW_PRESETS[variant];
  const [localRect, setLocalRect] = useState(rect);
  const rectRef = useRef(rect);
  const onRectChangeRef = useRef(onRectChange);
  const interactionRef = useRef<Interaction | undefined>(undefined);
  const restoreBodyRef = useRef<(() => void) | null>(null);

  onRectChangeRef.current = onRectChange;

  const publishRect = useCallback((next: BridgeFloatingWindowRect) => {
    if (bridgeFloatingWindowRectsEqual(rectRef.current, next)) return;
    rectRef.current = next;
    setLocalRect(next);
    onRectChangeRef.current(next);
  }, []);

  const endInteraction = useCallback(() => {
    interactionRef.current = undefined;
    restoreBodyRef.current?.();
    restoreBodyRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fitToContainer = () => {
      const bounds = containerBounds(container);
      const current = rectRef.current;
      publishRect(current
        ? clampBridgeFloatingWindowRect(current, bounds, preset)
        : createBridgeFloatingWindowRect(bounds, preset));
    };

    fitToContainer();
    const observer = new ResizeObserver(fitToContainer);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, preset, publishRect, windowId]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      const container = containerRef.current;
      if (!interaction || !container || event.pointerId !== interaction.pointerId) return;
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;
      const bounds = containerBounds(container);
      publishRect(interaction.mode === "move"
        ? moveBridgeFloatingWindowRect(interaction.startRect, deltaX, deltaY, bounds, preset)
        : resizeBridgeFloatingWindowRect(interaction.startRect, deltaX, deltaY, interaction.mode, bounds, preset));
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId === interactionRef.current?.pointerId) endInteraction();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") endInteraction();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("blur", endInteraction);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("blur", endInteraction);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      endInteraction();
    };
  }, [containerRef, endInteraction, preset, publishRect]);

  const beginInteraction = useCallback((event: ReactPointerEvent<HTMLElement>, mode: Interaction["mode"]) => {
    if (event.button !== 0 || !rectRef.current) return;
    if (mode === "move" && event.target instanceof Element && event.target.closest("button, input, select, textarea, a")) return;
    event.preventDefault();
    const body = document.body;
    const previousUserSelect = body.style.userSelect;
    const previousCursor = body.style.cursor;
    body.style.userSelect = "none";
    body.style.cursor = mode === "move" ? "grabbing" : mode === "east" ? "ew-resize" : mode === "south" ? "ns-resize" : "nwse-resize";
    restoreBodyRef.current?.();
    restoreBodyRef.current = () => {
      body.style.userSelect = previousUserSelect;
      body.style.cursor = previousCursor;
    };
    interactionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: rectRef.current,
      mode,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const windowStyle = localRect ? {
    width: `${localRect.width}px`,
    height: `${localRect.height}px`,
    transform: `translate3d(${localRect.x}px, ${localRect.y}px, 0)`,
  } : { visibility: "hidden" as const };

  return (
    <section
      className={`${styles.floatingWindow} ${variant === "tool" ? styles.toolWindow : styles.sceneWindow} ${className ?? ""}`}
      style={windowStyle}
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
      data-bridge-floating-window={windowId}
    >
      <header className={styles.floatingHeader} onPointerDown={(event) => beginInteraction(event, "move")}>
        <Grip className={styles.dragIndicator} size={16} strokeWidth={1.8} aria-hidden="true" />
        <div><strong>{title}</strong>{subtitle ? <span>{subtitle}</span> : null}</div>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onClose(); }}
          aria-label={`${title} 닫기`}
        ><X size={19} /></button>
      </header>
      {children}
      <div className={`${styles.resizeHandle} ${styles.resizeEast}`} onPointerDown={(event) => beginInteraction(event, "east")} aria-hidden="true" />
      <div className={`${styles.resizeHandle} ${styles.resizeSouth}`} onPointerDown={(event) => beginInteraction(event, "south")} aria-hidden="true" />
      <div className={`${styles.resizeHandle} ${styles.resizeSoutheast}`} onPointerDown={(event) => beginInteraction(event, "southeast")} aria-hidden="true" />
    </section>
  );
}
