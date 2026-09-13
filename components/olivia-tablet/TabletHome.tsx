"use client";

import type { TabletAppId, TabletNavigationContext } from "@/lib/olivia/tablet/navigation";
import TabletAppIcon from "./TabletAppIcon";
import { TABLET_APPS } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";

export default function TabletHome({ onNavigate }: {
  onNavigate: (app: TabletAppId, context?: TabletNavigationContext) => void;
}) {
  const apps = TABLET_APPS.filter((app) => app.id !== "home");

  return (
    <section className={styles.tabletHome} aria-label="Olivia 앱 홈">
      <div className={styles.homeAppGrid}>
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            className={styles.homeAppButton}
            onClick={() => onNavigate(app.id)}
            disabled={app.disabled}
            aria-label={`${app.title}${app.disabled ? ", 준비 중" : ""}`}
          >
            <TabletAppIcon appId={app.id} size={60} />
            <span>{app.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
