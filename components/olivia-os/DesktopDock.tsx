"use client";

import { Layers } from "lucide-react";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaChatModeStore } from "@/lib/store/useOliviaChatModeStore";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import styles from "./OliviaDesktop.module.css";

// 고정 Dock 앱(스펙 2-22): Desktop, 고객관리, 일정, 사진작업실, 문서함, Olivia. 견적/계약·콘티는
// 기본 노출에서 뺐다 — 실행 중이면(향후 확장 대비) 동적으로 뒤에 추가된다.
const BASE_DOCK_APP_IDS = ["customer", "calendar", "photo-workspace", "documents"];

export function DesktopDock() {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);
  const toggleShowDesktop = useOliviaDesktopStore((state) => state.toggleShowDesktop);
  const toggleChat = useOliviaChatModeStore((state) => state.toggleChat);

  const runningExtraIds = Object.keys(windows).filter((id) => !BASE_DOCK_APP_IDS.includes(id));
  const dockAppIds = [...BASE_DOCK_APP_IDS, ...runningExtraIds];
  const dockApps = dockAppIds.map((id) => oliviaAppRegistry.find((app) => app.id === id)).filter((app) => app !== undefined);

  // Dock 클릭 규칙 단순화(스펙 2-9): 닫힘→open, minimized→restore+focus, 열려있고 비활성→focus,
  // 활성 상태에서 다시 클릭→minimize(권장안 채택).
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
        <span className={styles.dockIcon}><Layers size={22} /></span>
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
            <span className={styles.dockIcon}>{app.icon}</span>
            <span className={styles.dockLabel}>{app.title}</span>
            {running && <span className={styles.dockIndicator} />}
          </button>
        );
      })}
      <div className={styles.dockDivider} />
      <button type="button" className={styles.dockButton} onClick={toggleChat} aria-label="Olivia 대화">
        <span className={styles.dockIcon}><OliviaIcon size={22} /></span>
        <span className={styles.dockLabel}>Olivia</span>
      </button>
    </div>
  );
}
