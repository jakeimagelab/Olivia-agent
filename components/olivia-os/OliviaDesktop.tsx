"use client";

import { useEffect } from "react";
import { resetDesktopSession, useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { DesktopTopBar } from "./DesktopTopBar";
import { DesktopSurface } from "./DesktopSurface";
import { DesktopDock } from "./DesktopDock";
import styles from "./OliviaDesktop.module.css";

// OLIVIA OS Phase 1 루트 셸 — TopBar + Surface(shortcuts+windows) + Dock 조립.
// height:100dvh overflow:hidden으로 body가 page처럼 길어지지 않게 한다(스펙 1-1).
export default function OliviaDesktop() {
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const activeTitle = useOliviaDesktopStore((state) => (activeWindowId ? state.windows[activeWindowId]?.title ?? null : null));

  // OLIVIA OS가 canonical root인 동안 문서 자체는 움직이지 않고 각 AppWindow만 스크롤한다.
  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlCursor = document.documentElement.style.cursor;
    const previousBodyCursor = document.body.style.cursor;
    if (document.pointerLockElement) document.exitPointerLock?.();
    document.documentElement.classList.remove("pc-custom-cursor-active");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.cursor = "default";
    document.body.style.cursor = "default";
    resetDesktopSession();
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.cursor = previousHtmlCursor;
      document.body.style.cursor = previousBodyCursor;
    };
  }, []);

  return (
    <div className={styles.desktop}>
      <DesktopTopBar activeAppTitle={activeTitle} />
      <DesktopSurface />
      <DesktopDock />
    </div>
  );
}
