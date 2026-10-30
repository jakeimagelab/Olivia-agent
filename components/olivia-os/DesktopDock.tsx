"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CalendarDays,
  FileText,
  Film,
  Home,
  Images,
  LayoutPanelTop,
  NotebookText,
  Search,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { getDockApps } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import { resolveDockLayout, type DockIconSize } from "./dockLayout";
import styles from "./OliviaDesktop.module.css";

const DOCK_ICONS: Record<string, LucideIcon> = {
  customer: UsersRound,
  calendar: CalendarDays,
  "olivia-bridge": Images,
  "video-studio": Film,
  quote: FileText,
  conti: LayoutPanelTop,
  "work-journal": NotebookText,
};

const DOCK_LABELS: Record<string, string> = {
  "olivia-bridge": "Bridge",
};

export function DesktopDock() {
  const dockRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ iconSize: DockIconSize; scrollable: boolean }>({ iconSize: 48, scrollable: false });
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);
  const toggleShowDesktop = useOliviaDesktopStore((state) => state.toggleShowDesktop);
  const setGlobalSearchOpen = useOliviaDesktopUtilityStore((state) => state.setGlobalSearchOpen);
  const apps = getDockApps();

  useEffect(() => {
    const area = dockRef.current?.parentElement;
    if (!area) return;
    const measure = () => setLayout(resolveDockLayout(area.clientWidth, apps.length + 2, 3));
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
        <button
          type="button"
          className={`${styles.dockButton} ${activeWindowId === null ? styles.active : ""}`}
          onClick={() => {
            if (activeWindowId) toggleShowDesktop();
          }}
          aria-label="홈"
          aria-current={activeWindowId === null ? "page" : undefined}
        >
          <span className={styles.dockGlyph} aria-hidden="true">
            <Home size={Math.min(24, Math.round(layout.iconSize * .55))} strokeWidth={1.75} />
          </span>
          <span className={styles.dockLabel}>홈</span>
        </button>
        {apps.map((app, index) => (
          <div className={styles.dockItemGroup} key={app.id}>
            {index === 2 || index === 4 ? <span className={styles.dockDivider} aria-hidden="true" /> : null}
            <button type="button" className={`${styles.dockButton} ${activeWindowId === app.id ? styles.active : ""}`} onClick={() => open(app.id, app.title, app.defaultSize.width, app.defaultSize.height)} aria-label={app.title}>
              <span className={styles.dockGlyph} aria-hidden="true">{(() => {
                const Icon = DOCK_ICONS[app.id] ?? FileText;
                return <Icon size={Math.min(24, Math.round(layout.iconSize * .55))} strokeWidth={1.75} />;
              })()}</span>
              <span className={styles.dockLabel}>{DOCK_LABELS[app.id] ?? app.title}</span>
              {windows[app.id] ? <i className={styles.dockIndicator} /> : null}
            </button>
          </div>
        ))}
        <span className={styles.dockDivider} aria-hidden="true" />
        <button type="button" className={styles.dockButton} onClick={() => setGlobalSearchOpen(true)} aria-label="모든 앱">
          <span className={styles.dockGlyph}><Search size={24} strokeWidth={1.75} /></span>
          <span className={styles.dockLabel}>모든 앱</span>
        </button>
      </div>
    </div>
  );
}
