"use client";

import type { ReactNode } from "react";
import styles from "./AppIcon.module.css";

// Visual Polish Pass §4, Wallpaper Integration §7/§13 — 모든 앱 아이콘이 동일한 tile
// geometry를 쓰게 하는 공용 렌더러. Dock/DesktopShortcut이 raw Lucide 아이콘을 직접 노출하던
// 방식을 대체한다. registry의 icon 필드 자체(ReactNode)는 그대로 두고, 표시 방식만 통일한다.
// 새 wallpaper 위에서 바로가기/Dock 각각 살짝 다른 유리감을 준다(variant), Dock은 활성 상태
// 표시도 tile 레벨에서 담당한다(active).
export function AppIcon({ icon, size = 44, variant = "dock", active = false }: {
  icon: ReactNode;
  size?: number;
  variant?: "shortcut" | "dock";
  active?: boolean;
}) {
  return (
    <span
      className={`${styles.tile} ${variant === "shortcut" ? styles.shortcut : styles.dock} ${active ? styles.active : ""}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
    >
      {icon}
    </span>
  );
}
