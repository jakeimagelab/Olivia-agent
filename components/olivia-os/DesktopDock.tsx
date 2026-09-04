"use client";

import { Layers } from "lucide-react";
import { getDockApps, getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { AppIcon } from "./AppIcon";
import styles from "./OliviaDesktop.module.css";

export function DesktopDock() {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);
  const toggleShowDesktop = useOliviaDesktopStore((state) => state.toggleShowDesktop);

  const fixedDockApps = getDockApps();
  const fixedDockIds = new Set(fixedDockApps.map((app) => app.id));
  const runningExtraApps = Object.keys(windows)
    .filter((id) => !fixedDockIds.has(id))
    .map(getOliviaApp)
    .filter((app) => app !== undefined);
  const dockApps = [...fixedDockApps, ...runningExtraApps];

  // Dock 클릭 규칙 단순화(스펙 2-9): 닫힘→open, minimized→restore+focus, 열려있고 비활성→focus,
  // 활성 상태에서 다시 클릭→minimize(권장안 채택). Olivia도 이제 이 규칙을 그대로 쓴다(스펙 변경
  // — 이전에는 useOliviaChatModeStore.toggleChat()을 직접 호출하는 특수 케이스였다).
  const handleDockClick = (appId: string, title: string, width: number, height: number) => {
    const win = windows[appId];
    if (!win) { openApp({ appId, title, width, height }); return; }
    if (win.minimized) { restoreWindow(appId); return; }
    if (activeWindowId === appId) { minimizeWindow(appId); return; }
    focusWindow(appId);
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
            <AppIcon icon={app.icon} size={46} />
            <span className={styles.dockLabel}>{app.title}</span>
            {running && <span className={styles.dockIndicator} />}
          </button>
        );
      })}
    </div>
  );
}
