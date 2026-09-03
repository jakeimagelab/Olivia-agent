"use client";

import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { DesktopTopBar } from "./DesktopTopBar";
import { DesktopSurface } from "./DesktopSurface";
import { DesktopDock } from "./DesktopDock";
import styles from "./OliviaDesktop.module.css";

// OLIVIA OS Phase 1 루트 셸 — TopBar + Surface(shortcuts+windows) + Dock 조립.
// height:100dvh overflow:hidden으로 body가 page처럼 길어지지 않게 한다(스펙 1-1).
export default function OliviaDesktop() {
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const activeTitle = useOliviaDesktopStore((state) => (activeWindowId ? state.windows[activeWindowId]?.title ?? null : null));

  return (
    <div className={styles.desktop}>
      <DesktopTopBar activeAppTitle={activeTitle} />
      <DesktopSurface />
      <DesktopDock />
    </div>
  );
}
