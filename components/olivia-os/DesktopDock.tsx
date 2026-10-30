"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Grid3X3 } from "lucide-react";
import { getDockApps } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import { AppIcon } from "./AppIcon";
import { resolveDockLayout, type DockIconSize } from "./dockLayout";
import styles from "./OliviaDesktop.module.css";

export function DesktopDock() {
  const dockRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ iconSize: DockIconSize; scrollable: boolean }>({ iconSize: 48, scrollable: false });
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);
  const setGlobalSearchOpen = useOliviaDesktopUtilityStore((state) => state.setGlobalSearchOpen);
  const apps = getDockApps();

  useEffect(() => {
    const area = dockRef.current?.parentElement;
    if (!area) return;
    const measure = () => setLayout(resolveDockLayout(area.clientWidth, apps.length + 1, 3));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [apps.length]);

  const open = (appId: string, title: string, width: number, height: number) => {
    const win = windows[appId];
    if (!win) openApp({ appId, title, width, height });
    else if (win.minimized) restoreWindow(appId);
    else focusWindow(appId);
  };
  const style = { "--dock-icon-size": `${layout.iconSize}px` } as CSSProperties;

  return (
    <div className={styles.dockReveal}>
      <span className={styles.dockHint} aria-hidden="true" />
      <div ref={dockRef} className={`${styles.dock} ${layout.scrollable ? styles.dockScrollable : ""}`} style={style} role="toolbar" aria-label="Dock">
        {apps.map((app, index) => (
          <div className={styles.dockItemGroup} key={app.id}>
            {index === 3 || index === 6 || index === 9 ? <span className={styles.dockDivider} aria-hidden="true" /> : null}
            <button type="button" className={`${styles.dockButton} ${activeWindowId === app.id ? styles.active : ""}`} onClick={() => open(app.id, app.title, app.defaultSize.width, app.defaultSize.height)} aria-label={app.title}>
              <AppIcon icon={app.icon} size={layout.iconSize} active={activeWindowId === app.id} />
              <span className={styles.dockLabel}>{app.title}</span>
              {windows[app.id] ? <i className={styles.dockIndicator} /> : null}
            </button>
          </div>
        ))}
        <span className={styles.dockDivider} aria-hidden="true" />
        <button type="button" className={styles.dockButton} onClick={() => setGlobalSearchOpen(true)} aria-label="모든 앱">
          <span className={styles.dockAllAppsIcon}><Grid3X3 size={25} /></span>
          <span className={styles.dockLabel}>모든 앱</span>
        </button>
      </div>
    </div>
  );
}
