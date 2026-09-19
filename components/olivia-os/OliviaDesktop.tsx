"use client";

import { useCallback, useEffect, useState } from "react";
import { loadDesktopState, useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { HomeDashboardDataProvider } from "@/components/dashboard/HomeDashboardData";
import { useOliviaDesktopContextBridge } from "./useOliviaDesktopContextBridge";
import { DesktopTopBar } from "./DesktopTopBar";
import { DesktopSurface } from "./DesktopSurface";
import { DesktopDock } from "./DesktopDock";
import { DesktopGlobalSearch } from "./DesktopGlobalSearch";
import { DesktopSystemOverlay, type DesktopOverlayKind, type WallpaperMode } from "./DesktopSystemOverlay";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import styles from "./OliviaDesktop.module.css";

const WALLPAPER_KEY = "olivia-os-wallpaper-v1";
const CUSTOM_WALLPAPER_KEY = "olivia-os-custom-wallpaper-v1";

async function optimizeWallpaper(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 2560 / image.naturalWidth, 1600 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("배경화면을 처리할 수 없습니다.");
    context.fillStyle = "#082e2b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// OLIVIA OS Phase 1 루트 셸 — TopBar + Surface(shortcuts+windows) + Dock 조립.
// height:100dvh overflow:hidden으로 body가 page처럼 길어지지 않게 한다(스펙 1-1).
export default function OliviaDesktop() {
  const [overlay, setOverlay] = useState<DesktopOverlayKind>(null);
  const [wallpaper, setWallpaper] = useState<WallpaperMode>("original");
  const [customWallpaper, setCustomWallpaper] = useState<string>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number }>();

  // Phase 3 — 활성 창을 Olivia의 LLM 컨텍스트(useOliviaContextStore)로 계속 흘려보낸다.
  useOliviaDesktopContextBridge();

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
    loadDesktopState(new Set(oliviaAppRegistry.map((app) => app.id)));
    try {
      // localStorage를 먼저 읽어 화면을 바로 그린다(깜빡임 방지) — DB 조회가 끝나면 그 값으로
      // 덮어써서 컴퓨터마다 배경이 다르던 문제를 없앤다(DB가 always-wins 소스).
      const savedWallpaper = window.localStorage.getItem(WALLPAPER_KEY);
      const savedCustomWallpaper = window.localStorage.getItem(CUSTOM_WALLPAPER_KEY) || undefined;
      setCustomWallpaper(savedCustomWallpaper);
      if (savedWallpaper === "custom" && savedCustomWallpaper) setWallpaper("custom");
      else if (savedWallpaper === "original" || savedWallpaper === "soft") setWallpaper(savedWallpaper);
    } catch { /* optional desktop preference */ }
    fetch("/api/desktop-settings")
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) return;
        const { wallpaper_mode, custom_wallpaper_data_url } = data.settings;
        if (custom_wallpaper_data_url) setCustomWallpaper(custom_wallpaper_data_url);
        if (wallpaper_mode === "custom" ? custom_wallpaper_data_url : wallpaper_mode === "original" || wallpaper_mode === "soft") {
          setWallpaper(wallpaper_mode);
        }
        try {
          window.localStorage.setItem(WALLPAPER_KEY, wallpaper_mode);
          if (custom_wallpaper_data_url) window.localStorage.setItem(CUSTOM_WALLPAPER_KEY, custom_wallpaper_data_url);
        } catch { /* optional desktop preference */ }
      })
      .catch(() => { /* DB 미연결이어도 localStorage 값으로 계속 동작 */ });
    const ensureOliviaFrame = window.requestAnimationFrame(() => {
      const state = useOliviaDesktopStore.getState();
      if (state.windows["olivia-chat"]) return;
      const app = oliviaAppRegistry.find((candidate) => candidate.id === "olivia-chat");
      if (app) state.openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height, placement: "right" });
    });
    return () => {
      window.cancelAnimationFrame(ensureOliviaFrame);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.cursor = previousHtmlCursor;
      document.body.style.cursor = previousBodyCursor;
    };
  }, []);

  const syncWallpaperSettings = useCallback((body: { wallpaperMode?: WallpaperMode; customWallpaperDataUrl?: string }) => {
    fetch("/api/desktop-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((error) => console.error("[desktop-settings] 동기화 실패:", error));
  }, []);

  const selectWallpaper = useCallback((mode: WallpaperMode) => {
    if (mode === "custom" && !customWallpaper) return;
    setWallpaper(mode);
    try { window.localStorage.setItem(WALLPAPER_KEY, mode); } catch { /* optional desktop preference */ }
    syncWallpaperSettings({ wallpaperMode: mode });
  }, [customWallpaper, syncWallpaperSettings]);

  const selectCustomWallpaper = useCallback(async (file: File) => {
    try {
      const dataUrl = await optimizeWallpaper(file);
      setCustomWallpaper(dataUrl);
      setWallpaper("custom");
      try {
        window.localStorage.setItem(CUSTOM_WALLPAPER_KEY, dataUrl);
        window.localStorage.setItem(WALLPAPER_KEY, "custom");
      } catch { /* 현재 세션에서는 그대로 사용할 수 있다 */ }
      syncWallpaperSettings({ wallpaperMode: "custom", customWallpaperDataUrl: dataUrl });
    } catch {
      window.alert("PNG, JPG 또는 WebP 이미지를 선택해 주세요.");
    }
  }, [syncWallpaperSettings]);

  const openAllApps = useCallback(() => {
    const app = oliviaAppRegistry.find((candidate) => candidate.id === "all-apps");
    if (app) useOliviaDesktopStore.getState().openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height });
    setContextMenu(undefined);
  }, []);

  return (
    <div className={styles.desktop} data-wallpaper={wallpaper}>
      {/* Wallpaper Asset Integration §24 — pseudo-element(::before/::after)는 stacking
          규칙상 다른 static 요소보다 위로 그려지는 버그를 한 번 만든 적이 있어서(Visual Polish
          Pass), 실제 배경 이미지 레이어부터는 진짜 DOM 엘리먼트로 분리해 그 문제 자체를 없앤다. */}
      <div className={styles.wallpaperLayer} style={wallpaper === "custom" && customWallpaper ? { backgroundImage: `url("${customWallpaper}")` } : undefined} aria-hidden="true" />
      <div className={styles.overlayLayer} aria-hidden="true" />
      <div className={styles.vignetteLayer} aria-hidden="true" />
      <DesktopTopBar onOpenOverlay={setOverlay} />
      <HomeDashboardDataProvider>
        <div className={styles.desktopBody}>
          <DesktopSurface onDesktopContextMenu={(x, y) => setContextMenu({ x, y })} />
        </div>
      </HomeDashboardDataProvider>
      <div className={styles.dockArea}>
        <DesktopDock onOpenOverlay={setOverlay} />
      </div>
      <DesktopGlobalSearch />
      {contextMenu ? (
        <div className={styles.desktopContextMenuBackdrop} onPointerDown={() => setContextMenu(undefined)} onContextMenu={(event) => event.preventDefault()}>
          <div className={styles.desktopContextMenu} style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={openAllApps}>모든 앱</button>
            <span />
            <button type="button" onClick={() => { setOverlay("wallpaper"); setContextMenu(undefined); }}>바탕화면 설정…</button>
          </div>
        </div>
      ) : null}
      <DesktopSystemOverlay kind={overlay} wallpaper={wallpaper} customWallpaper={customWallpaper} onWallpaperChange={selectWallpaper} onCustomWallpaper={selectCustomWallpaper} onClose={() => setOverlay(null)} />
    </div>
  );
}
