"use client";

import { useEffect, useRef, useState } from "react";
import { getDesktopShortcutApps, oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { DesktopShortcut } from "./DesktopShortcut";
import { AppWindow } from "./window/AppWindow";
import { SnapZoneOverlay } from "./window/SnapZoneOverlay";
import styles from "./OliviaDesktop.module.css";

export function DesktopSurface() {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const closeWindow = useOliviaDesktopStore((state) => state.closeWindow);
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const setWorkspaceSize = useOliviaDesktopStore((state) => state.setWorkspaceSize);
  const [selectedShortcut, setSelectedShortcut] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const shortcutApps = getDesktopShortcutApps();

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
        closeWindow(activeWindowId);
      } else if (meta && event.key.toLowerCase() === "m" && activeWindowId) {
        event.preventDefault();
        minimizeWindow(activeWindowId);
      } else if (event.key === "Escape") {
        setSelectedShortcut(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeWindowId, closeWindow, minimizeWindow]);

  return (
    <div ref={surfaceRef} className={styles.surface} onPointerDown={(event) => { if (event.currentTarget === event.target) setSelectedShortcut(null); }}>
      <div className={styles.shortcutLayer}>
        {shortcutApps.map((app) => (
          <DesktopShortcut
            key={app.id}
            app={app}
            selected={selectedShortcut === app.id}
            onSelect={() => setSelectedShortcut(app.id)}
            onOpen={() => openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height })}
          />
        ))}
      </div>
      <div className={styles.windowLayer}>
        {Object.values(windows).map((win) => {
          const app = oliviaAppRegistry.find((candidate) => candidate.id === win.appId);
          if (!app) return null;
          const Content = app.component;
          return (
            <AppWindow key={win.id} windowId={win.id} workspaceRef={surfaceRef} minWidth={app.minSize?.width} minHeight={app.minSize?.height}>
              <Content />
            </AppWindow>
          );
        })}
      </div>
      <SnapZoneOverlay />
    </div>
  );
}
