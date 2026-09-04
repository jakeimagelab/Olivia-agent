"use client";

import { useEffect, useState } from "react";
import { Bell, Search, Sparkles } from "lucide-react";
import styles from "./OliviaDesktop.module.css";

// 메뉴 라벨/검색/알림/온라인 상태는 시각 요소만 — 실제 클릭 동작/헬스체크는 없다(Visual Polish
// Pass 범위 — 기능 로직 추가 금지).
const MENU_LABELS = ["파일", "편집", "보기", "이동", "도구", "도움말"];

export function DesktopTopBar({ activeAppTitle }: { activeAppTitle: string | null }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={styles.topBar}>
      <div className={styles.topBarLeft}>
        <span className={styles.topBarBrandMark}><Sparkles size={13} /></span>
        <span className={styles.topBarBrand}>Olivia</span>
        <div className={styles.menuBar} role="menubar" aria-label="메뉴 (준비 중)">
          {MENU_LABELS.map((label) => (
            <span key={label} className={styles.menuBarItem} role="menuitem" aria-disabled="true">
              {label}
            </span>
          ))}
        </div>
        {activeAppTitle && (
          <span className={styles.topBarActiveTitle}>
            <span className={styles.topBarActiveTitleDot}>·</span>
            {activeAppTitle}
          </span>
        )}
      </div>
      <div className={styles.topBarRight}>
        <div className={styles.topBarSearch}>
          <Search size={13} className={styles.topBarSearchIcon} />
          <input type="text" placeholder="검색" className={styles.topBarSearchInput} disabled />
        </div>
        <button type="button" className={styles.topBarIconButton} aria-label="알림">
          <Bell size={15} />
        </button>
        <span className={styles.topBarStatus}>
          <span className={styles.topBarStatusDot} />
          연결됨
        </span>
        {now && (
          <span className={styles.topBarClock}>
            {now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}
