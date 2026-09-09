"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { motion } from "framer-motion";
import { oliviaMotion } from "@/lib/motion/presets";
import {
  useOliviaDesktopStore, DESKTOP_DOCK_SAFE_AREA,
} from "@/lib/store/useOliviaDesktopStore";
import { useWindowInteractions } from "./useWindowInteractions";
import { resolveSnapBounds } from "./snapZones";
import { WindowHeader } from "./WindowHeader";
import { AppWindowErrorBoundary } from "./AppWindowErrorBoundary";
import styles from "./AppWindow.module.css";

export function AppWindow({ windowId, workspaceRef, minWidth = 420, minHeight = 320, children }: {
  windowId: string;
  workspaceRef: RefObject<HTMLDivElement | null>;
  minWidth?: number;
  minHeight?: number;
  children: ReactNode;
}) {
  const win = useOliviaDesktopStore((state) => state.windows[windowId]);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const closeWindow = useOliviaDesktopStore((state) => state.closeWindow);
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const snapWindow = useOliviaDesktopStore((state) => state.snapWindow);
  const unsnapWindow = useOliviaDesktopStore((state) => state.unsnapWindow);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  // drag/resize 중엔 CSS transition을 꺼서(즉각 반응), maximize/restore 때만 부드럽게 움직인다.
  const [interacting, setInteracting] = useState(false);
  const { beginDrag, beginResize } = useWindowInteractions(windowId, minWidth, minHeight, workspaceRef, setInteracting);

  if (!win) return null;

  const isActive = activeWindowId === windowId;

  const toggleMaximize = () => {
    if (win.snapMode === "maximized") {
      unsnapWindow(windowId);
    } else {
      const surface = workspaceRef.current;
      if (!surface) return;
      const bounds = resolveSnapBounds("maximized", surface.clientWidth, surface.clientHeight, DESKTOP_DOCK_SAFE_AREA);
      snapWindow(windowId, "maximized", bounds);
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
      // 이미 활성화된 창 안의 버튼을 누를 때마다 z-index를 다시 올리면 pointerdown과 click
      // 사이에 창 전체가 리렌더된다. 일반 버튼은 대부분 버티지만 네이티브 파일/폴더 선택처럼
      // 사용자 활성화 타이밍에 민감한 API는 클릭이 유실될 수 있으므로, 비활성 창을 처음
      // 포커스할 때만 store를 갱신한다.
      onPointerDownCapture={() => { if (!isActive) focusWindow(windowId); }}
      data-app-window={win.appId}
      role="region"
      aria-label={win.title}
    >
      <div className={styles.body}>
        <WindowHeader
          title={win.title}
          onPointerDown={beginDrag}
          onDoubleClick={toggleMaximize}
          onClose={win.appId === "olivia-chat" ? undefined : () => closeWindow(windowId)}
          onMinimize={() => minimizeWindow(windowId)}
          onToggleMaximize={toggleMaximize}
        />
        <div className={styles.content}>
          <AppWindowErrorBoundary appTitle={win.title}>{children}</AppWindowErrorBoundary>
        </div>
      </div>
      {win.snapMode === "none" && (
        <>
          <div className={styles.resizeHandleE} onPointerDown={(event) => beginResize(event, "e")} />
          <div className={styles.resizeHandleS} onPointerDown={(event) => beginResize(event, "s")} />
          <div className={styles.resizeHandleSe} onPointerDown={(event) => beginResize(event, "se")} />
        </>
      )}
    </motion.div>
  );
}
