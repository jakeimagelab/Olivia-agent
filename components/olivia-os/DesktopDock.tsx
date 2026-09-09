"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getDockApps, getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { AppIcon as ColorAppIcon } from "@/components/AppIcon";
import { AppIcon } from "./AppIcon";
import { resolveDockLayout, type DockIconSize } from "./dockLayout";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import styles from "./OliviaDesktop.module.css";

import type { DesktopOverlayKind } from "./DesktopSystemOverlay";

function DockTooltip({ children }: { children: string }) {
  return <span className={styles.dockTooltip} role="tooltip">{children}</span>;
}

export function DesktopDock({ onOpenOverlay }: { onOpenOverlay: (kind: DesktopOverlayKind) => void }) {
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockLayout, setDockLayout] = useState<{ iconSize: DockIconSize; scrollable: boolean }>({
    iconSize: 48,
    scrollable: false,
  });
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
  const dockButtonCount = dockApps.length + 5;

  useEffect(() => {
    const dock = dockRef.current;
    const availableArea = dock?.parentElement;
    if (!availableArea) return;

    const measure = () => {
      const nextLayout = resolveDockLayout(availableArea.clientWidth, dockButtonCount);
      setDockLayout((current) => (
        current.iconSize === nextLayout.iconSize && current.scrollable === nextLayout.scrollable
          ? current
          : nextLayout
      ));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(availableArea);
    return () => observer.disconnect();
  }, [dockButtonCount]);

  const dockStyle = {
    "--dock-icon-size": `${dockLayout.iconSize}px`,
    "--dock-button-size": `${dockLayout.iconSize + 4}px`,
  } as CSSProperties;

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
    <div
      ref={dockRef}
      className={`${styles.dock} ${dockLayout.scrollable ? styles.dockScrollable : ""}`}
      style={dockStyle}
      data-icon-size={dockLayout.iconSize}
      role="toolbar"
      aria-label="Dock"
    >
      <button type="button" className={styles.dockButton} onClick={toggleShowDesktop} aria-label="바탕화면 보기" data-tooltip="바탕화면 보기">
        <DockTooltip>바탕화면 보기</DockTooltip>
        <AppIcon icon={<ColorAppIcon name="today" size={26} aria-hidden focusable={false} />} size={dockLayout.iconSize} />
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
            <AppIcon icon={app.icon} size={dockLayout.iconSize} active={active} />
            {running && <span className={styles.dockIndicator} />}
          </button>
        );
      })}
      <button type="button" className={styles.dockButton} onClick={openMemo} aria-label="메모" data-tooltip="메모">
        <DockTooltip>메모</DockTooltip>
        <AppIcon icon={<ColorAppIcon name="memo" size={26} aria-hidden focusable={false} />} size={dockLayout.iconSize} active={activeWindowId === "memo"} />
        {windows.memo ? <span className={styles.dockIndicator} /> : null}
      </button>
      <div className={styles.dockDivider} />
      <button type="button" className={styles.dockButton} onClick={openAllApps} aria-label="모든 앱" data-tooltip="모든 앱">
        <DockTooltip>모든 앱</DockTooltip>
        <AppIcon icon={<ColorAppIcon name="workspace" size={26} aria-hidden focusable={false} />} size={dockLayout.iconSize} active={activeWindowId === "all-apps"} />
        {windows["all-apps"] ? <span className={styles.dockIndicator} /> : null}
      </button>
      <button type="button" className={styles.dockButton} onClick={() => onOpenOverlay("wallpaper")} aria-label="배경화면" data-tooltip="배경화면">
        <DockTooltip>배경화면</DockTooltip>
        <AppIcon icon={<ColorAppIcon name="image-director" size={26} aria-hidden focusable={false} />} size={dockLayout.iconSize} />
      </button>
      <button type="button" className={styles.dockButton} onClick={() => launchHref("/trash", "휴지통")} aria-label="휴지통" data-tooltip="휴지통">
        <DockTooltip>휴지통</DockTooltip>
        <AppIcon icon={<ColorAppIcon name="trash" size={26} aria-hidden focusable={false} />} size={dockLayout.iconSize} active={windows["legacy-route"]?.context?.resourceId === "/trash"} />
        {windows["legacy-route"]?.context?.resourceId === "/trash" ? <span className={styles.dockIndicator} /> : null}
      </button>
    </div>
  );
}
