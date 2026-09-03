"use client";

import { Layers } from "lucide-react";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaChatModeStore } from "@/lib/store/useOliviaChatModeStore";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import styles from "./OliviaDesktop.module.css";

// 초기 Dock 앱: Home/Desktop, 고객관리, 일정, 사진작업실, 콘티, 문서함, Olivia(스펙 1-5).
// 견적/계약은 Desktop Shortcut에는 있지만 Dock 목록엔 없다(스펙 원문 그대로).
const DOCK_APP_IDS = ["customer", "calendar", "photo-workspace", "conti", "documents"];

export function DesktopDock() {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const minimizeAll = useOliviaDesktopStore((state) => state.minimizeAll);
  const toggleChat = useOliviaChatModeStore((state) => state.toggleChat);

  const dockApps = DOCK_APP_IDS.map((id) => oliviaAppRegistry.find((app) => app.id === id)).filter((app) => app !== undefined);

  return (
    <div className={styles.dock} role="toolbar" aria-label="Dock">
      <button type="button" className={styles.dockButton} onClick={minimizeAll} aria-label="바탕화면 보기">
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
            onClick={() => openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height })}
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
