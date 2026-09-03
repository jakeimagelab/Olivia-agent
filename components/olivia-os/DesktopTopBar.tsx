"use client";

import { useEffect, useState } from "react";
import { Bell, Search } from "lucide-react";
import styles from "./OliviaDesktop.module.css";

// 검색/알림은 future-ready 구조만(스펙 1-3) — 이번 Phase에서 실제 기능은 없다.
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
        <span className={styles.topBarBrand}>Olivia</span>
        {activeAppTitle && <span className={styles.topBarActiveTitle}>{activeAppTitle}</span>}
      </div>
      <div className={styles.topBarRight}>
        <button type="button" className={styles.topBarIconButton} aria-label="검색">
          <Search size={15} />
        </button>
        <button type="button" className={styles.topBarIconButton} aria-label="알림">
          <Bell size={15} />
        </button>
        {now && (
          <span className={styles.topBarClock}>
            {now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}
