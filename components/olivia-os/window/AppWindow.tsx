"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { oliviaMotion } from "@/lib/motion/presets";
import {
  useOliviaDesktopStore, DESKTOP_TOPBAR_HEIGHT, DESKTOP_DOCK_SAFE_AREA,
} from "@/lib/store/useOliviaDesktopStore";
import { useWindowInteractions } from "./useWindowInteractions";
import { WindowHeader } from "./WindowHeader";
import { AppWindowErrorBoundary } from "./AppWindowErrorBoundary";
import styles from "./AppWindow.module.css";

export function AppWindow({ windowId, minWidth = 420, minHeight = 320, children }: {
  windowId: string;
  minWidth?: number;
  minHeight?: number;
  children: ReactNode;
}) {
  const win = useOliviaDesktopStore((state) => state.windows[windowId]);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const closeWindow = useOliviaDesktopStore((state) => state.closeWindow);
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const maximizeWindow = useOliviaDesktopStore((state) => state.maximizeWindow);
  const restoreMaximizedWindow = useOliviaDesktopStore((state) => state.restoreMaximizedWindow);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const { beginDrag, beginResize } = useWindowInteractions(windowId, minWidth, minHeight);
  // drag/resize 중엔 CSS transition을 꺼서(즉각 반응), maximize/restore 때만 부드럽게 움직인다.
  const [interacting, setInteracting] = useState(false);
  const interactingRef = useRef(false);

  if (!win) return null;

  const isActive = activeWindowId === windowId;

  const withInteractionGuard = (handler: (event: React.PointerEvent) => void) => (event: React.PointerEvent) => {
    interactingRef.current = true;
    setInteracting(true);
    handler(event);
    const clear = () => {
      interactingRef.current = false;
      setInteracting(false);
      window.removeEventListener("pointerup", clear);
    };
    window.addEventListener("pointerup", clear, { once: true });
  };

  const toggleMaximize = () => {
    if (win.maximized) {
      restoreMaximizedWindow(windowId);
    } else {
      maximizeWindow(windowId, {
        left: 12, top: DESKTOP_TOPBAR_HEIGHT + 8,
        right: window.innerWidth - 12, bottom: window.innerHeight - DESKTOP_DOCK_SAFE_AREA,
      });
    }
  };

  return (
    <motion.div
      className={`${styles.window} ${isActive ? styles.active : ""}`}
      style={{
        left: win.x, top: win.y, width: win.width, height: win.height,
        zIndex: win.zIndex, display: win.minimized ? "none" : "flex",
        transition: interacting ? "none" : "left 220ms cubic-bezier(.22,1,.36,1), top 220ms cubic-bezier(.22,1,.36,1), width 220ms cubic-bezier(.22,1,.36,1), height 220ms cubic-bezier(.22,1,.36,1)",
      }}
      initial={{ opacity: 0, scale: 0.98, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={oliviaMotion.page}
      onPointerDownCapture={() => focusWindow(windowId)}
      role="region"
      aria-label={win.title}
    >
      <div className={styles.body}>
        <WindowHeader
          title={win.title}
          onPointerDown={withInteractionGuard(beginDrag)}
          onDoubleClick={toggleMaximize}
          onClose={() => closeWindow(windowId)}
          onMinimize={() => minimizeWindow(windowId)}
          onToggleMaximize={toggleMaximize}
        />
        <div className={styles.content}>
          <AppWindowErrorBoundary appTitle={win.title}>{children}</AppWindowErrorBoundary>
        </div>
      </div>
      {!win.maximized && (
        <>
          <div className={styles.resizeHandleE} onPointerDown={withInteractionGuard((event) => beginResize(event, "e"))} />
          <div className={styles.resizeHandleS} onPointerDown={withInteractionGuard((event) => beginResize(event, "s"))} />
          <div className={styles.resizeHandleSe} onPointerDown={withInteractionGuard((event) => beginResize(event, "se"))} />
        </>
      )}
    </motion.div>
  );
}
