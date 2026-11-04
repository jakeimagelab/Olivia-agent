"use client";

import { AppIcon as DesktopAppIcon, type IconName } from "@/components/AppIcon";
import { CalendarAppIcon } from "@/components/olivia-os/CalendarAppIcon";
import type { MobilePrimaryView } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

const ITEMS: Array<{ view: MobilePrimaryView; label: string; iconName?: IconName; calendar?: boolean }> = [
  { view: "home", label: "홈", iconName: "today" },
  { view: "clients", label: "고객", iconName: "clients" },
  { view: "calendar", label: "일정", calendar: true },
  { view: "person-select", label: "사진선택", iconName: "select-gallery" },
  { view: "chat", label: "Olivia", iconName: "olivia" },
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
