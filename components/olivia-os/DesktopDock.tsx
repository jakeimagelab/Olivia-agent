"use client";

import { Layers } from "lucide-react";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import styles from "./OliviaDesktop.module.css";

// 고정 Dock 앱 — 참고 이미지 요청으로 Phase 2의 "최대 4~6개" 결정을 뒤집고 확장했다(사용자
// 명시 승인). 견적서/계약서/콘티도 이제 기본 노출된다.
const BASE_DOCK_APP_IDS = [
  "customer", "calendar", "documents", "quote", "contract",
  "conti", "photo-workspace", "review-studio",
];

export function DesktopDock() {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const minimizeWindow = useOliviaDesktopStore((state) => state.minimizeWindow);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);
  const toggleShowDesktop = useOliviaDesktopStore((state) => state.toggleShowDesktop);

  const runningExtraIds = Object.keys(windows).filter((id) => !BASE_DOCK_APP_IDS.includes(id) && id !== "olivia-chat");
  const dockAppIds = [...BASE_DOCK_APP_IDS, ...runningExtraIds];
  const dockApps = dockAppIds.map((id) => oliviaAppRegistry.find((app) => app.id === id)).filter((app) => app !== undefined);

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
      <button
        type="button"
        className={`${styles.dockButton} ${activeWindowId === "olivia-chat" ? styles.active : ""}`}
        onClick={() => handleDockClick("olivia-chat", "Olivia", 420, 640)}
        aria-label="Olivia 대화"
      >
        <span className={styles.dockIcon}><OliviaIcon size={22} /></span>
        <span className={styles.dockLabel}>Olivia</span>
        {windows["olivia-chat"] && <span className={styles.dockIndicator} />}
      </button>
    </div>
  );
}
