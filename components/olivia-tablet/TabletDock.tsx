"use client";

import type { TabletAppId } from "@/lib/olivia/tablet/navigation";
import TabletAppIcon from "./TabletAppIcon";
import { TABLET_APPS } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";

export default function TabletDock({ activeApp, onNavigate }: {
  activeApp: TabletAppId;
  onNavigate: (app: TabletAppId) => void;
}) {
  return (
    <nav className={styles.dockOuter} aria-label="Olivia Tablet 앱">
      <div className={styles.dockScroll}>
        {TABLET_APPS.map((app) => {
          const active = app.id === activeApp;
          return (
            <button
              key={app.id}
              type="button"
              className={`${styles.dockButton} ${active ? styles.dockButtonActive : ""} ${app.disabled ? styles.dockButtonDisabled : ""}`}
              aria-current={active ? "page" : undefined}
              aria-label={`${app.title}${app.disabled ? ", 준비 중" : ""}`}
              onClick={() => onNavigate(app.id)}
            >
              <span className={styles.dockIcon}><TabletAppIcon appId={app.id} /></span>
              <span className={styles.dockLabel}>{app.title}</span>
              {active ? <span className={styles.dockIndicator} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
