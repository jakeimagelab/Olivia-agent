"use client";

import { useEffect } from "react";
import { useOliviaDesktopStore, loadDesktopState } from "@/lib/store/useOliviaDesktopStore";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { DesktopTopBar } from "./DesktopTopBar";
import { DesktopSurface } from "./DesktopSurface";
import { DesktopDock } from "./DesktopDock";
import styles from "./OliviaDesktop.module.css";

// OLIVIA OS Phase 1 루트 셸 — TopBar + Surface(shortcuts+windows) + Dock 조립.
// height:100dvh overflow:hidden으로 body가 page처럼 길어지지 않게 한다(스펙 1-1).
export default function OliviaDesktop() {
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const activeTitle = useOliviaDesktopStore((state) => (activeWindowId ? state.windows[activeWindowId]?.title ?? null : null));

  // 재접속 시 이전 세션의 창 배치를 복원한다(스펙 2-6~2-8). knownAppIds는 여기서 넘긴다 —
  // store 파일이 무거운 앱 컴포넌트가 딸린 Registry를 직접 import하지 않게 하기 위해서다.
  useEffect(() => {
    loadDesktopState(new Set(oliviaAppRegistry.map((app) => app.id)));
  }, []);

  return (
    <div className={styles.desktop}>
      <DesktopTopBar activeAppTitle={activeTitle} />
      <DesktopSurface />
      <DesktopDock />
    </div>
  );
}
