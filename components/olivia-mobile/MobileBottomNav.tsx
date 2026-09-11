"use client";

import { CalendarDays, FileText, Home, MessageCircle, StickyNote } from "lucide-react";
import type { MobilePrimaryView } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

const ITEMS: Array<{ view: MobilePrimaryView; label: string; Icon: typeof Home }> = [
  { view: "home", label: "홈", Icon: Home },
  { view: "calendar", label: "캘린더", Icon: CalendarDays },
  { view: "memo", label: "메모", Icon: StickyNote },
  { view: "documents", label: "문서", Icon: FileText },
  { view: "chat", label: "올리비아 채팅", Icon: MessageCircle },
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
      {ITEMS.map(({ view, label, Icon }) => (
        <button
          key={view}
          type="button"
          className={activeView === view ? styles.bottomNavActive : undefined}
          aria-current={activeView === view ? "page" : undefined}
          onClick={() => onNavigate(view)}
        >
          <Icon size={20} strokeWidth={1.8} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

