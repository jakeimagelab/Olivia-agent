"use client";

import type { OliviaAppDefinition } from "./registry/oliviaAppRegistry";
import { AppIcon } from "./AppIcon";
import styles from "./OliviaDesktop.module.css";

// OLIVIA OS의 앱 진입은 웹 사용자의 기대에 맞춰 한 번 클릭으로 선택과 실행을 함께 처리한다.
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
      onClick={() => {
        onSelect();
        onOpen();
      }}
      aria-label={app.title}
    >
      <AppIcon icon={app.icon} size={50} variant="shortcut" />
      <span className={styles.shortcutLabel}>{app.title}</span>
    </button>
  );
}
