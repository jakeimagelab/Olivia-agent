"use client";

import { AppIcon as SharedAppIcon } from "@/components/AppIcon";
import { AppIcon as OliviaOsIconTile } from "@/components/olivia-os/AppIcon";
import { getOliviaApp } from "@/components/olivia-os/registry/oliviaAppRegistry";
import type { TabletAppId } from "@/lib/olivia/tablet/navigation";
import { TABLET_APPS, resolveTabletAppIconSource } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";

function TabletDockIcon({ appId, active }: { appId: TabletAppId; active: boolean }) {
  const source = resolveTabletAppIconSource(appId);
  const registryIcon = source.kind === "registry" ? getOliviaApp(source.appId)?.icon : null;
  const icon = registryIcon ?? (
    <SharedAppIcon
      name={source.kind === "shared" ? source.iconName : TABLET_APPS.find((app) => app.id === appId)!.fallbackIcon}
      size={28}
      aria-hidden
      focusable={false}
    />
  );
  return <OliviaOsIconTile icon={icon} size={44} active={active} />;
}

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
              <span className={styles.dockIcon}><TabletDockIcon appId={app.id} active={active} /></span>
              <span className={styles.dockLabel}>{app.title}</span>
              {active ? <span className={styles.dockIndicator} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
