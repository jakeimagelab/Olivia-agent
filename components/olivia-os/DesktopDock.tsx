"use client";

import { Image as ImageIcon, Layers, LayoutGrid, PenLine } from "lucide-react";
import { getDockApps, getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { AppIcon } from "./AppIcon";
import styles from "./OliviaDesktop.module.css";

import type { DesktopOverlayKind } from "./DesktopSystemOverlay";

export function DesktopDock({ onOpenOverlay }: { onOpenOverlay: (kind: DesktopOverlayKind) => void }) {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);
  const toggleShowDesktop = useOliviaDesktopStore((state) => state.toggleShowDesktop);

  const fixedDockApps = getDockApps().filter((app) => app.id !== "olivia-chat");
  const fixedDockIds = new Set(fixedDockApps.map((app) => app.id));
  const utilityDockIds = new Set(["memo", "olivia-chat"]);
  const runningExtraApps = Object.keys(windows)
    .filter((id) => !utilityDockIds.has(id) && !fixedDockIds.has(id))
    .map(getOliviaApp)
    .filter((app) => app !== undefined);
  const dockApps = [...fixedDockApps, ...runningExtraApps];

  // Dock 클릭 규칙: 닫힘→open, minimized→restore, 비활성→focus, 활성→minimize.
  // OLIVIA는 Dock 앱이 아니라 별도의 상시 System Assistant 패널로 유지된다.
  const handleDockClick = (appId: string, title: string, width: number, height: number) => {
    const win = windows[appId];
    if (!win) { openApp({ appId, title, width, height }); return; }
    if (win.minimized) { restoreWindow(appId); return; }
    if (activeWindowId === appId) { minimizeWindow(appId); return; }
    focusWindow(appId);
  };

  const openMemo = () => {
    const app = getOliviaApp("memo");
    if (app) handleDockClick(app.id, app.title, app.defaultSize.width, app.defaultSize.height);
  };

  return (
    <div className={styles.dock} role="toolbar" aria-label="Dock">
      <button type="button" className={styles.dockButton} onClick={toggleShowDesktop} aria-label="바탕화면 보기">
        <AppIcon icon={<Layers size={24} />} size={46} />
        <span className={styles.dockLabel}>Desktop</span>
      </button>
      <div className={styles.dockDivider} />
      {dockApps.map((app) => {
        const win = windows[app.id];
        const running = Boolean(win);
        const active = activeWindowId === app.id;
        return (
          <button
            key={app.id}
            type="button"
            className={`${styles.dockButton} ${active ? styles.active : ""}`}
            onClick={() => handleDockClick(app.id, app.title, app.defaultSize.width, app.defaultSize.height)}
            aria-label={app.title}
          >
            <AppIcon icon={app.icon} size={46} active={active} />
            <span className={styles.dockLabel}>{app.title}</span>
            {running && <span className={styles.dockIndicator} />}
          </button>
        );
      })}
      <div className={styles.dockDivider} />
      <button type="button" className={styles.dockButton} onClick={openMemo} aria-label="메모">
        <AppIcon icon={<PenLine size={24} />} size={46} />
        <span className={styles.dockLabel}>메모</span>
        {windows.memo ? <span className={styles.dockIndicator} /> : null}
      </button>
      <button type="button" className={styles.dockButton} onClick={() => onOpenOverlay("apps")} aria-label="모든 앱">
        <AppIcon icon={<LayoutGrid size={24} />} size={46} />
        <span className={styles.dockLabel}>모든 앱</span>
      </button>
      <button type="button" className={styles.dockButton} onClick={() => onOpenOverlay("wallpaper")} aria-label="배경화면">
        <AppIcon icon={<ImageIcon size={24} />} size={46} />
        <span className={styles.dockLabel}>배경</span>
      </button>
    </div>
  );
}
