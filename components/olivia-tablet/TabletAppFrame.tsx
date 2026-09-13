"use client";

import type { ReactNode } from "react";
import type { TabletAppId } from "@/lib/olivia/tablet/navigation";
import TabletAppIcon from "./TabletAppIcon";
import { getTabletApp } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";

export default function TabletAppFrame({
  appId,
  children,
  compact = false,
}: {
  appId: Exclude<TabletAppId, "home" | "photo-workspace">;
  children: ReactNode;
  compact?: boolean;
}) {
  const app = getTabletApp(appId);

  return (
    <section className={`${styles.unifiedApp} ${compact ? styles.unifiedAppCompact : ""}`}>
      <header className={styles.unifiedHero}>
        <div className={styles.unifiedHeroIdentity}>
          <TabletAppIcon appId={appId} size={48} />
          <div>
            <span>{app.eyebrow}</span>
            <h1>{app.title}</h1>
            <p>{app.description}</p>
          </div>
        </div>
        <div className={styles.unifiedStatus}>
          <i aria-hidden="true" />
          <span>OLIVIA TABLET</span>
          <strong>{app.status}</strong>
        </div>
      </header>
      <div className={styles.unifiedWorkSurface}>{children}</div>
    </section>
  );
}
