"use client";

import type { ReactNode } from "react";
import styles from "./AppIcon.module.css";

// Visual Polish Pass §4 — 모든 앱 아이콘이 동일한 tile geometry(둥근 사각형 + 배경 + 보더 +
// 그림자)를 쓰게 하는 공용 렌더러. Dock/DesktopShortcut이 raw Lucide 아이콘을 직접 노출하던
// 방식을 대체한다. registry의 icon 필드 자체(ReactNode)는 그대로 두고, 표시 방식만 통일한다.
export function AppIcon({ icon, size = 44 }: { icon: ReactNode; size?: number }) {
  return (
    <span
      className={styles.tile}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
    >
      {icon}
    </span>
  );
}
