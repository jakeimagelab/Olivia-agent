"use client";

import { useEffect } from "react";
import { Check, CircleHelp, Images } from "lucide-react";
import styles from "./OliviaDesktop.module.css";

export type DesktopOverlayKind = "wallpaper" | "help" | null;
export type WallpaperMode = "original" | "soft";

export function DesktopSystemOverlay({ kind, wallpaper, onWallpaperChange, onClose }: {
  kind: DesktopOverlayKind;
  wallpaper: WallpaperMode;
  onWallpaperChange: (mode: WallpaperMode) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!kind) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [kind, onClose]);

  if (!kind) return null;

  return (
    <div className={styles.systemPopoverBackdrop} onPointerDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className={styles.systemPopover} aria-label={kind === "wallpaper" ? "배경화면" : "도움말"}>
        <header>
          <span>{kind === "wallpaper" ? <Images size={15} /> : <CircleHelp size={15} />}</span>
          <div>
            <strong>{kind === "wallpaper" ? "배경화면" : "Olivia OS 도움말"}</strong>
            <small>{kind === "wallpaper" ? "승인된 Olivia 배경 표현을 선택하세요." : "기본 창 조작 안내"}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

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
            <div><dt>Olivia</dt><dd>Dock에서 열고 다른 창처럼 이동·최소화</dd></div>
          </dl>
        ) : null}
      </section>
    </div>
  );
}
