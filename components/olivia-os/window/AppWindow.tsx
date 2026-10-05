"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { motion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import { oliviaMotion } from "@/lib/motion/presets";
import {
  useOliviaDesktopStore, DESKTOP_DOCK_SAFE_AREA,
} from "@/lib/store/useOliviaDesktopStore";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import { useWindowInteractions } from "./useWindowInteractions";
import { resolveSnapBounds } from "./snapZones";
import { WindowHeader } from "./WindowHeader";
import { AppWindowErrorBoundary } from "./AppWindowErrorBoundary";
import {
  calculateCompactChatWidth,
  COMPACT_CHAT_EDGE_INSET,
} from "./compactChatLayout";
import { closeOliviaDesktopWindow } from "@/lib/olivia/desktop/windowLifecycle";
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
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const snapWindow = useOliviaDesktopStore((state) => state.snapWindow);
  const unsnapWindow = useOliviaDesktopStore((state) => state.unsnapWindow);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const workspaceWidth = useOliviaDesktopStore((state) => state.workspaceWidth);
  const chatCompact = useOliviaDesktopUtilityStore((state) => state.chatCompact);
  const setChatCompact = useOliviaDesktopUtilityStore((state) => state.setChatCompact);
  // drag/resize 중엔 CSS transition을 꺼서(즉각 반응), maximize/restore 때만 부드럽게 움직인다.
  const [interacting, setInteracting] = useState(false);
  const [dockWidth, setDockWidth] = useState(0);
  const { beginDrag, beginResize } = useWindowInteractions(windowId, minWidth, minHeight, workspaceRef, setInteracting);

  const isChatCompact = win?.appId === "olivia-chat" && chatCompact;

  useEffect(() => {
    if (!isChatCompact) return;
    const dock = document.querySelector<HTMLElement>('[aria-label="Dock"]');
    if (!dock) return;

    const measureDock = () => setDockWidth(dock.getBoundingClientRect().width);
    measureDock();
    const observer = new ResizeObserver(measureDock);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [isChatCompact]);

  if (!win) return null;

  const isActive = activeWindowId === windowId;
  const compactWidth = calculateCompactChatWidth(workspaceWidth, dockWidth);
  const compactHeight = 70;
  const renderedBounds = isChatCompact
    ? {
        x: workspaceWidth > 0 ? Math.max(12, workspaceWidth - compactWidth - COMPACT_CHAT_EDGE_INSET) : win.x,
        y: 0,
        width: compactWidth,
        height: compactHeight,
      }
    : win;
  const errorBoundaryResetKey = [win.appId, win.context?.resourceId, win.context?.clientId, win.context?.projectId].filter(Boolean).join(":");

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
      className={`${styles.window} ${isActive ? styles.active : ""} ${isChatCompact ? styles.chatCompact : ""}`}
      style={{
        left: renderedBounds.x,
        top: isChatCompact ? "auto" : renderedBounds.y,
        bottom: isChatCompact ? "var(--desktop-dock-bottom)" : "auto",
        width: renderedBounds.width,
        height: renderedBounds.height,
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
      data-chat-compact={isChatCompact || undefined}
      role="region"
      aria-label={isChatCompact ? "Olivia 한 줄 채팅" : win.title}
    >
      <div className={styles.body}>
        <WindowHeader
          title={win.title}
          compatibilityMode={win.appId === "legacy-route"}
          onPointerDown={beginDrag}
          onDoubleClick={toggleMaximize}
          onClose={win.appId === "olivia-chat" ? () => setChatCompact(true) : () => closeOliviaDesktopWindow(windowId)}
          onMinimize={() => minimizeWindow(windowId)}
          onToggleMaximize={toggleMaximize}
        />
        <div className={styles.content}>
          <AppWindowErrorBoundary appId={win.appId} appTitle={win.title} windowId={win.id} context={win.context} resetKey={errorBoundaryResetKey}>
            {children}
          </AppWindowErrorBoundary>
        </div>
      </div>
      {isChatCompact ? (
        <button
          type="button"
          className={styles.chatCompactRestore}
          aria-label="채팅창 다시 키우기"
          title="채팅창 다시 키우기"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            setChatCompact(false);
            focusWindow(windowId);
          }}
        >
          <Maximize2 size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}
      {!isChatCompact && win.snapMode === "none" && (
        <>
          <div className={styles.resizeHandleE} onPointerDown={(event) => beginResize(event, "e")} />
          <div className={styles.resizeHandleS} onPointerDown={(event) => beginResize(event, "s")} />
          <div className={styles.resizeHandleSe} onPointerDown={(event) => beginResize(event, "se")} />
        </>
      )}
    </motion.div>
  );
}
