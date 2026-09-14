"use client";

import { cloneElement, isValidElement, type ReactElement } from "react";
import { AppIcon as SharedAppIcon } from "@/components/AppIcon";
import { AppIcon as OliviaOsIconTile } from "@/components/olivia-os/AppIcon";
import { getOliviaApp } from "@/components/olivia-os/registry/oliviaAppRegistry";
import type { TabletAppId } from "@/lib/olivia/tablet/navigation";
import { getTabletApp, resolveTabletAppIconSource } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";

export default function TabletAppIcon({ appId, size = 44, fullBleed = false }: { appId: TabletAppId; size?: number; fullBleed?: boolean }) {
  const source = resolveTabletAppIconSource(appId);
  const registryIcon = source.kind === "registry" ? getOliviaApp(source.appId)?.icon : null;
  const icon = fullBleed && registryIcon && isValidElement(registryIcon)
    ? cloneElement(registryIcon as ReactElement<Record<string, unknown>>, { style: { width: size, height: size } })
    : registryIcon ?? (
      <SharedAppIcon
        name={source.kind === "shared" ? source.iconName : getTabletApp(appId).fallbackIcon}
        size={fullBleed ? size : Math.round(size * 0.64)}
        aria-hidden
        focusable={false}
      />
    );

  return <OliviaOsIconTile icon={icon} size={size} active={false} className={fullBleed ? styles.homeIconTile : undefined} />;
}
