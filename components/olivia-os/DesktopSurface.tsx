"use client";

import { useEffect, useState } from "react";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import { DesktopShortcut } from "./DesktopShortcut";
import { AppWindow } from "./window/AppWindow";
import { SnapZoneOverlay } from "./window/SnapZoneOverlay";
import styles from "./OliviaDesktop.module.css";

// 바탕화면에 모든 기능을 다 늘어놓지 않는다(스펙 2-21) — 고객관리/일정/사진작업실/문서함 +
// Olivia만 최대 5개. 견적/계약·콘티는 Dock/검색/앱 내부/Olivia로 접근한다.
const SHORTCUT_APP_IDS = ["customer", "calendar", "photo-workspace", "documents"];

export function DesktopSurface() {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const closeWindow = useOliviaDesktopStore((state) => state.closeWindow);
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const reconcileViewport = useOliviaDesktopStore((state) => state.reconcileViewport);
  const toggleChat = useOliviaChatModeStore((state) => state.toggleChat);
  const [selectedShortcut, setSelectedShortcut] = useState<string | null>(null);

  const shortcutApps = SHORTCUT_APP_IDS.map((id) => oliviaAppRegistry.find((app) => app.id === id)).filter((app) => app !== undefined);

  // 화면 크기가 바뀌어도(외부 모니터 해제 등) 창이 화면 밖에 남지 않게 한다(스펙 2-15/2-16).
  useEffect(() => {
    const handleResize = () => reconcileViewport(window.innerWidth, window.innerHeight);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [reconcileViewport]);

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
    <div className={styles.surface} onPointerDown={(event) => { if (event.currentTarget === event.target) setSelectedShortcut(null); }}>
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
        <DesktopShortcut
          app={{ title: "Olivia", icon: <Sparkles size={20} /> }}
          selected={selectedShortcut === "olivia"}
          onSelect={() => setSelectedShortcut("olivia")}
          onOpen={toggleChat}
        />
      </div>
      <div className={styles.windowLayer}>
        {Object.values(windows).map((win) => {
          const app = oliviaAppRegistry.find((candidate) => candidate.id === win.appId);
          if (!app) return null;
          const Content = app.component;
          return (
            <AppWindow key={win.id} windowId={win.id} minWidth={app.minSize?.width} minHeight={app.minSize?.height}>
              <Content />
            </AppWindow>
          );
        })}
      </div>
      <SnapZoneOverlay />
    </div>
  );
}
