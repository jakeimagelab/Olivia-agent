"use client";

import { AppIcon as DesktopAppIcon, type IconName } from "@/components/AppIcon";
import { CalendarAppIcon } from "@/components/olivia-os/CalendarAppIcon";
import type { MobilePrimaryView } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

const ITEMS: Array<{ view: MobilePrimaryView; label: string; iconName?: IconName; calendar?: boolean }> = [
  { view: "home", label: "홈", iconName: "today" },
  { view: "calendar", label: "캘린더", calendar: true },
  { view: "memo", label: "메모", iconName: "memo" },
  { view: "documents", label: "문서", iconName: "library" },
  { view: "chat", label: "올리비아 채팅", iconName: "olivia" },
];

export default function MobileBottomNav({
  activeView,
  onNavigate,
}: {
  activeView: MobilePrimaryView | null;
  onNavigate: (view: MobilePrimaryView) => void;
}) {
  return (
    <nav className={styles.bottomNav} aria-label="모바일 주요 메뉴">
      {ITEMS.map(({ view, label, iconName, calendar }) => (
        <button
          key={view}
          type="button"
          className={activeView === view ? styles.bottomNavActive : undefined}
          aria-current={activeView === view ? "page" : undefined}
          onClick={() => onNavigate(view)}
        >
          <span className={styles.bottomNavIcon} aria-hidden="true">
            {calendar ? <CalendarAppIcon /> : iconName ? <DesktopAppIcon name={iconName} size={28} /> : null}
          </span>
          <span className={styles.bottomNavLabel}>{label}</span>
        </button>
      ))}
    </nav>
  );
}
