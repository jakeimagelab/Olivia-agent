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
      {/* Wallpaper Asset Integration §24 — pseudo-element(::before/::after)는 stacking
          규칙상 다른 static 요소보다 위로 그려지는 버그를 한 번 만든 적이 있어서(Visual Polish
          Pass), 실제 배경 이미지 레이어부터는 진짜 DOM 엘리먼트로 분리해 그 문제 자체를 없앤다. */}
      <div className={styles.wallpaperLayer} aria-hidden="true" />
      <div className={styles.overlayLayer} aria-hidden="true" />
      <div className={styles.vignetteLayer} aria-hidden="true" />
      <DesktopTopBar activeAppTitle={activeTitle} />
      <DesktopSurface />
      <DesktopDock />
    </div>
  );
}
