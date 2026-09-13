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
        {app.id !== "home" ? (
          <button type="button" className={styles.backButton} onClick={onHome} aria-label="Tablet 홈으로 이동">
            <ArrowLeft size={21} strokeWidth={1.7} />
          </button>
        ) : null}
        <button type="button" className={styles.brandIdentity} onClick={onHome} aria-label="Olivia 홈으로 이동">
          <span className={styles.brandMark}><Image src="/assets/photoclinic-mark.png" alt="" width={28} height={28} priority /></span>
          <strong>OLIVIA</strong>
        </button>
        <span className={styles.topBarDivider} aria-hidden="true" />
        <div className={styles.appIdentity}>
          {app.id === "home" ? <span>좋은 하루예요.</span> : null}
          <strong>{app.id === "home" ? "오늘의 업무" : app.title}</strong>
        </div>
      </div>
      <div className={styles.topBarMeta}>
        <span>{dateLabel}</span>
      </div>
    </header>
  );
}
