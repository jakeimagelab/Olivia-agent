"use client";

import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import type { TabletAppDefinition } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";

export default function TabletTopBar({ app, onHome }: { app: TabletAppDefinition; onHome: () => void }) {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(now);

  return (
    <header className={styles.topBar}>
      <div className={styles.topBarIdentity}>
        {app.id === "home" ? (
          <span className={styles.brandMark}><Image src="/assets/photoclinic-mark.png" alt="" width={30} height={30} priority /></span>
        ) : (
          <button type="button" className={styles.backButton} onClick={onHome} aria-label="Tablet 홈으로 이동">
            <ArrowLeft size={21} strokeWidth={1.7} />
          </button>
        )}
        <div>
          <span>{app.eyebrow}</span>
          <strong>{app.title}</strong>
        </div>
      </div>
      <div className={styles.topBarMeta}>
        <span className={styles.surfaceBadge}>TABLET</span>
        <span>{dateLabel}</span>
      </div>
    </header>
  );
}
