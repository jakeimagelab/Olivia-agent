"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { Maximize2 } from "lucide-react";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import { AppWindowErrorBoundary } from "./AppWindowErrorBoundary";
import {
  calculateCompactChatWidth,
  COMPACT_CHAT_EDGE_INSET,
} from "./compactChatLayout";
import styles from "./AppWindow.module.css";

type AppWindowProps = {
  windowId: string;
  workspaceRef: RefObject<HTMLDivElement | null>;
  minWidth?: number;
  minHeight?: number;
  children: ReactNode;
};

export function AppWindow({ windowId, children }: AppWindowProps) {
  const win = useOliviaDesktopStore((state) => state.windows[windowId]);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const workspaceWidth = useOliviaDesktopStore((state) => state.workspaceWidth);
  const chatCompact = useOliviaDesktopUtilityStore((state) => state.chatCompact);
  const setChatCompact = useOliviaDesktopUtilityStore((state) => state.setChatCompact);
  const [dockWidth, setDockWidth] = useState(0);

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

  const compactWidth = calculateCompactChatWidth(workspaceWidth, dockWidth);
  const compactHeight = 70;
  const errorBoundaryResetKey = [win.appId, win.context?.resourceId, win.context?.clientId, win.context?.projectId].filter(Boolean).join(":");

  return (
    <div
      className={`${styles.window} ${styles.fullScreen} ${isChatCompact ? styles.chatCompact : ""}`}
      style={isChatCompact ? {
        left: workspaceWidth > 0 ? Math.max(12, workspaceWidth - compactWidth - COMPACT_CHAT_EDGE_INSET) : 12,
        top: "auto",
        right: "auto",
        bottom: "var(--desktop-dock-bottom)",
        width: compactWidth,
        height: compactHeight,
      } : undefined}
      data-app-window={win.appId}
      data-chat-compact={isChatCompact || undefined}
      role="region"
      aria-label={isChatCompact ? "Olivia 한 줄 채팅" : win.title}
    >
      <div className={styles.body}>
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
    </div>
  );
}
