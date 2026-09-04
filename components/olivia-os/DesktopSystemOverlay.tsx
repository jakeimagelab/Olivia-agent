"use client";

import { useEffect } from "react";
import { Check, CircleHelp, Images, LayoutGrid } from "lucide-react";
import { AppIcon } from "./AppIcon";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import styles from "./OliviaDesktop.module.css";

export type DesktopOverlayKind = "apps" | "wallpaper" | "help" | null;
export type WallpaperMode = "original" | "soft";

export function DesktopSystemOverlay({ kind, wallpaper, onWallpaperChange, onClose }: {
  kind: DesktopOverlayKind;
  wallpaper: WallpaperMode;
  onWallpaperChange: (mode: WallpaperMode) => void;
  onClose: () => void;
}) {
  const openApp = useOliviaDesktopStore((state) => state.openApp);

  useEffect(() => {
    if (!kind) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [kind, onClose]);

  if (!kind) return null;

  const launchableApps = oliviaAppRegistry.filter((app) => app.id !== "olivia-chat");
  const open = (app: (typeof launchableApps)[number]) => {
    openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height });
    onClose();
  };

  return (
    <div className={styles.systemPopoverBackdrop} onPointerDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className={styles.systemPopover} aria-label={kind === "apps" ? "모든 앱" : kind === "wallpaper" ? "배경화면" : "도움말"}>
        <header>
          <span>{kind === "apps" ? <LayoutGrid size={15} /> : kind === "wallpaper" ? <Images size={15} /> : <CircleHelp size={15} />}</span>
          <div>
            <strong>{kind === "apps" ? "모든 앱" : kind === "wallpaper" ? "배경화면" : "Olivia OS 도움말"}</strong>
            <small>{kind === "apps" ? "작업할 앱을 선택하세요." : kind === "wallpaper" ? "승인된 Olivia 배경 표현을 선택하세요." : "기본 창 조작 안내"}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        {kind === "apps" ? (
          <div className={styles.allAppsGrid}>
            {launchableApps.map((app) => (
              <button type="button" key={app.id} onClick={() => open(app)}>
                <AppIcon icon={app.icon} size={42} />
                <span>{app.title}</span>
              </button>
            ))}
          </div>
        ) : null}

        {kind === "wallpaper" ? (
          <div className={styles.wallpaperChoices}>
            {(["original", "soft"] as const).map((mode) => (
              <button type="button" key={mode} className={wallpaper === mode ? styles.wallpaperSelected : ""} onClick={() => onWallpaperChange(mode)}>
                <span className={`${styles.wallpaperPreview} ${mode === "soft" ? styles.wallpaperPreviewSoft : ""}`} />
                <strong>{mode === "original" ? "Olivia Original" : "Olivia Soft"}</strong>
                {wallpaper === mode ? <Check size={14} /> : null}
              </button>
            ))}
          </div>
        ) : null}

        {kind === "help" ? (
          <dl className={styles.helpList}>
            <div><dt>앱 열기</dt><dd>Dock 또는 모든 앱에서 선택</dd></div>
            <div><dt>창 이동</dt><dd>창 제목 막대를 드래그</dd></div>
            <div><dt>창 닫기</dt><dd>⌘W 또는 빨간 버튼</dd></div>
            <div><dt>Olivia</dt><dd>오른쪽 패널에서 항상 사용</dd></div>
          </dl>
        ) : null}
      </section>
    </div>
  );
}
