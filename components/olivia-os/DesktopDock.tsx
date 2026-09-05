"use client";

import { getDockApps, getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { Icon } from "@/components/Icon";
import { AppIcon } from "./AppIcon";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import styles from "./OliviaDesktop.module.css";

import type { DesktopOverlayKind } from "./DesktopSystemOverlay";

function DockTooltip({ children }: { children: string }) {
  return <span className={styles.dockTooltip} role="tooltip">{children}</span>;
}

export function DesktopDock({ onOpenOverlay }: { onOpenOverlay: (kind: DesktopOverlayKind) => void }) {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);
  const toggleShowDesktop = useOliviaDesktopStore((state) => state.toggleShowDesktop);
  const launchHref = useDesktopAppLauncher();

  const fixedDockApps = getDockApps();
  const fixedDockIds = new Set(fixedDockApps.map((app) => app.id));
  const utilityDockIds = new Set(["memo", "all-apps", "olivia-chat"]);
  const runningExtraApps = Object.keys(windows)
    .filter((id) => !utilityDockIds.has(id) && !fixedDockIds.has(id))
    .map(getOliviaApp)
    .filter((app) => app !== undefined);
  const dockApps = [...fixedDockApps, ...runningExtraApps];

  // Dock 클릭 규칙: 닫힘→open, minimized→restore, 열림→focus.
  const handleDockClick = (appId: string, title: string, width: number, height: number) => {
    const win = windows[appId];
    if (!win) { openApp({ appId, title, width, height }); return; }
    if (win.minimized) { restoreWindow(appId); return; }
    focusWindow(appId);
  };

  const openMemo = () => {
    const app = getOliviaApp("memo");
    if (app) handleDockClick(app.id, app.title, app.defaultSize.width, app.defaultSize.height);
  };

  const openAllApps = () => {
    const app = getOliviaApp("all-apps");
    if (app) handleDockClick(app.id, app.title, app.defaultSize.width, app.defaultSize.height);
  };

  return (
    <div className={styles.dock} role="toolbar" aria-label="Dock">
      <button type="button" className={styles.dockButton} onClick={toggleShowDesktop} aria-label="바탕화면 보기" data-tooltip="바탕화면 보기">
        <DockTooltip>바탕화면 보기</DockTooltip>
        <AppIcon icon={<Icon name="today" size={26} aria-hidden focusable={false} />} size={48} />
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
            data-tooltip={app.title}
          >
            <DockTooltip>{app.title}</DockTooltip>
            <AppIcon icon={app.icon} size={48} active={active} />
            {running && <span className={styles.dockIndicator} />}
          </button>
        );
      })}
      <button type="button" className={styles.dockButton} onClick={openMemo} aria-label="메모" data-tooltip="메모">
        <DockTooltip>메모</DockTooltip>
        <AppIcon icon={<Icon name="memo" size={26} aria-hidden focusable={false} />} size={48} active={activeWindowId === "memo"} />
        {windows.memo ? <span className={styles.dockIndicator} /> : null}
      </button>
      <div className={styles.dockDivider} />
      <button type="button" className={styles.dockButton} onClick={openAllApps} aria-label="모든 앱" data-tooltip="모든 앱">
        <DockTooltip>모든 앱</DockTooltip>
        <AppIcon icon={<Icon name="workspace" size={26} aria-hidden focusable={false} />} size={48} active={activeWindowId === "all-apps"} />
        {windows["all-apps"] ? <span className={styles.dockIndicator} /> : null}
      </button>
      <button type="button" className={styles.dockButton} onClick={() => onOpenOverlay("wallpaper")} aria-label="배경화면" data-tooltip="배경화면">
        <DockTooltip>배경화면</DockTooltip>
        <AppIcon icon={<Icon name="image-director" size={26} aria-hidden focusable={false} />} size={48} />
      </button>
      <button type="button" className={styles.dockButton} onClick={() => launchHref("/trash", "휴지통")} aria-label="휴지통" data-tooltip="휴지통">
        <DockTooltip>휴지통</DockTooltip>
        <AppIcon icon={<Icon name="trash" size={26} aria-hidden focusable={false} />} size={48} active={windows["legacy-route"]?.context?.resourceId === "/trash"} />
        {windows["legacy-route"]?.context?.resourceId === "/trash" ? <span className={styles.dockIndicator} /> : null}
      </button>
    </div>
  );
}
