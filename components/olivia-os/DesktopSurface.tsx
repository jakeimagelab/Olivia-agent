"use client";

import { useEffect, useRef } from "react";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { AppWindow } from "./window/AppWindow";
import { SnapZoneOverlay } from "./window/SnapZoneOverlay";
import styles from "./OliviaDesktop.module.css";

export function DesktopSurface({ onDesktopContextMenu }: { onDesktopContextMenu?: (x: number, y: number) => void }) {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const closeWindow = useOliviaDesktopStore((state) => state.closeWindow);
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const setWorkspaceSize = useOliviaDesktopStore((state) => state.setWorkspaceSize);
  const surfaceRef = useRef<HTMLDivElement>(null);

  // WindowLayer 자체를 측정해 모든 창 좌표를 viewport가 아닌 DesktopSurface 기준으로 통일한다.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = () => setWorkspaceSize(surface.clientWidth, surface.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [setWorkspaceSize]);

  // 최소 키보드 단축키(스펙 2-29) — 브라우저 기본 동작과 크게 충돌하는 것은 넣지 않는다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "w" && activeWindowId) {
        event.preventDefault();
        const activeWindow = useOliviaDesktopStore.getState().windows[activeWindowId];
        if (activeWindow?.appId === "olivia-chat") minimizeWindow(activeWindowId);
        else closeWindow(activeWindowId);
      } else if (meta && event.key.toLowerCase() === "m" && activeWindowId) {
        event.preventDefault();
        minimizeWindow(activeWindowId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeWindowId, closeWindow, minimizeWindow]);

  return (
    <main
      ref={surfaceRef}
      className={styles.surface}
      aria-label="앱 작업 공간"
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest("[data-app-window]")) return;
        event.preventDefault();
        onDesktopContextMenu?.(
          Math.min(event.clientX, window.innerWidth - 224),
          Math.min(event.clientY, window.innerHeight - 110),
        );
      }}
    >
      <div className={styles.windowLayer}>
        {Object.values(windows).map((win) => {
          const app = oliviaAppRegistry.find((candidate) => candidate.id === win.appId);
          if (!app) return null;
          const Content = app.component;
          return (
            <AppWindow key={win.id} windowId={win.id} workspaceRef={surfaceRef} minWidth={app.minSize?.width} minHeight={app.minSize?.height}>
              <Content key={`${win.appId}:${win.context?.resourceId ?? ""}:${win.context?.clientId ?? ""}:${win.context?.projectId ?? ""}`} context={win.context} />
            </AppWindow>
          );
        })}
      </div>
      <SnapZoneOverlay />
    </main>
  );
}
