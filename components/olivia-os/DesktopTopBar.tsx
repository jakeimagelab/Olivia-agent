"use client";

import Image from "next/image";
import { ChevronDown, MessageCircle } from "lucide-react";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import { getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaRuntimeStatus } from "./OliviaRuntimeStatusProvider";
import { StatusPanelButton } from "./StatusPanelButton";
import styles from "./OliviaDesktop.module.css";

export function DesktopTopBar() {
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const activeWindow = useOliviaDesktopStore((state) => activeWindowId ? state.windows[activeWindowId] : undefined);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const setGlobalSearchOpen = useOliviaDesktopUtilityStore((state) => state.setGlobalSearchOpen);
  const appChatOpen = useOliviaDesktopUtilityStore((state) => state.appChatOpen);
  const toggleAppChat = useOliviaDesktopUtilityStore((state) => state.toggleAppChat);
  const { data: runtimeStatus, initialized: runtimeStatusInitialized } = useOliviaRuntimeStatus();
  const workerStatus = runtimeStatus?.diagnostics.items.find((item) => item.id === "worker");
  const nasStatus = runtimeStatus?.diagnostics.items.find((item) => item.id === "nas_connection");
  const workerOnline = workerStatus?.level === "ok";
  const nasConnected = nasStatus?.level === "ok";

  const workerLabel = !runtimeStatusInitialized
    ? "Mac Studio 확인 중 · NAS 확인 중"
    : !workerOnline
      ? "Mac Studio 꺼짐 · NAS 미확인"
      : !nasConnected
        ? "Mac Studio 연결 · NAS 끊김"
        : "Mac Studio · NAS";

  const openWorkspace = () => {
    const app = getOliviaApp("all-apps");
    if (!app) return;
    setGlobalSearchOpen(false);
    openApp({
      appId: app.id,
      title: app.title,
      width: app.defaultSize.width,
      height: app.defaultSize.height,
    });
  };

  return (
    <header className={styles.topBar} data-home={!activeWindowId}>
      <div className={styles.topBarLeft}>
        <Image className={styles.topBarLogo} src="/assets/photoclinic-logo.png" alt="포토클리닉" width={307} height={276} priority />
        <button type="button" className={styles.workspaceLauncher} onClick={openWorkspace}>
          작업실 <ChevronDown size={13} />
        </button>
      </div>
      <div className={styles.topBarRight}>
        <div className={styles.topBarLocation}>
          <strong>{activeWindow?.title ?? "홈"}</strong>
          {activeWindow?.context?.documentTitle || activeWindow?.context?.projectName || activeWindow?.context?.clientName ? (
            <span>{activeWindow.context.documentTitle ?? activeWindow.context.projectName ?? activeWindow.context.clientName}</span>
          ) : null}
        </div>
        <StatusPanelButton />
        <span className={styles.workerChip} data-online={workerOnline} data-nas={nasConnected}>
          <i />{workerLabel}
        </span>
        <button type="button" className={`${styles.topBarOliviaButton} ${appChatOpen ? styles.topBarOliviaButtonActive : ""}`} onClick={toggleAppChat} aria-label="Olivia 불러오기"><MessageCircle size={17} /><span>Olivia</span></button>
      </div>
    </header>
  );
}
