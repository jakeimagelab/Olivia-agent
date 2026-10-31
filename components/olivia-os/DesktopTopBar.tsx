"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronLeft, ChevronRight, CircleHelp, MessageCircle, Search } from "lucide-react";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import type { DesktopOverlayKind } from "./DesktopSystemOverlay";
import { StatusPanelButton } from "./StatusPanelButton";
import styles from "./OliviaDesktop.module.css";

type WorkerStatus = { online: boolean; nas_connected: boolean | null };

export function DesktopTopBar({ onOpenOverlay }: { onOpenOverlay: (kind: DesktopOverlayKind) => void }) {
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const activeWindow = useOliviaDesktopStore((state) => activeWindowId ? state.windows[activeWindowId] : undefined);
  const setSearchOpen = useOliviaDesktopUtilityStore((state) => state.setGlobalSearchOpen);
  const appChatOpen = useOliviaDesktopUtilityStore((state) => state.appChatOpen);
  const toggleAppChat = useOliviaDesktopUtilityStore((state) => state.toggleAppChat);
  const [worker, setWorker] = useState<WorkerStatus | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = () => fetch("/api/remote-workers/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (!disposed) setWorker(payload?.worker ?? null); })
      .catch(() => { if (!disposed) setWorker(null); });
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  const moveHistory = useCallback((direction: -1 | 1) => {
    window.dispatchEvent(new CustomEvent("olivia-desktop-history", { detail: { direction } }));
  }, []);
  const workerLabel = !worker
    ? "Mac Studio 확인 중 · NAS 확인 중"
    : !worker.online
      ? "Mac Studio 꺼짐 · NAS 미확인"
      : worker.nas_connected === false
        ? "Mac Studio 연결 · NAS 끊김"
        : "Mac Studio · NAS";

  return (
    <header className={styles.topBar} data-home={!activeWindowId}>
      <div className={styles.topBarLeft}>
        {activeWindowId ? (
          <div className={styles.topBarHistory}>
            <button type="button" onClick={() => moveHistory(-1)} aria-label="뒤로"><ChevronLeft size={17} /></button>
            <button type="button" onClick={() => moveHistory(1)} aria-label="앞으로"><ChevronRight size={17} /></button>
          </div>
        ) : null}
        <Image className={styles.topBarLogo} src="/assets/photoclinic-logo.png" alt="포토클리닉" width={307} height={276} priority />
        <button type="button" className={styles.workspaceLauncher} onClick={() => setSearchOpen(true)}>
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
        <button type="button" className={styles.topBarSearchButton} onClick={() => setSearchOpen(true)}>
          <Search size={14} /><span>어디로 갈까요</span><kbd>⌘K</kbd>
        </button>
        <StatusPanelButton />
        <span className={styles.workerChip} data-online={Boolean(worker?.online)} data-nas={worker?.nas_connected !== false}>
          <i />{workerLabel}
        </span>
        <button type="button" className={styles.topBarIconButton} onClick={() => onOpenOverlay("help")} aria-label="도움말"><CircleHelp size={17} /></button>
        <button type="button" className={`${styles.topBarOliviaButton} ${appChatOpen ? styles.topBarOliviaButtonActive : ""}`} onClick={toggleAppChat} aria-label="Olivia 불러오기"><MessageCircle size={17} /><span>Olivia</span></button>
      </div>
    </header>
  );
}
