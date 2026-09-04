"use client";

import type { OliviaAppDefinition } from "./registry/oliviaAppRegistry";
import styles from "./OliviaDesktop.module.css";

// single click = selected 상태, double click = openApp(스펙 1-4). macOS 아이콘을 흉내내지
// 않는다 — rounded square + thin border + mint accent + Lucide 아이콘.
// Olivia 바로가기처럼 실제 창이 없는 항목도 있을 수 있어 아이콘/제목만 받는다(전체
// OliviaAppDefinition을 요구하지 않음).
export function DesktopShortcut({ app, selected, onSelect, onOpen }: {
  app: Pick<OliviaAppDefinition, "title" | "icon">;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.shortcut} ${selected ? styles.selected : ""}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      aria-label={app.title}
    >
      <span className={styles.shortcutIcon}>{app.icon}</span>
      <span className={styles.shortcutLabel}>{app.title}</span>
    </button>
  );
}
