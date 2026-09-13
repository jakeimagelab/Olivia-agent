"use client";

import { AppIcon as SharedAppIcon } from "@/components/AppIcon";
import { AppIcon as OliviaOsIconTile } from "@/components/olivia-os/AppIcon";
import { getOliviaApp } from "@/components/olivia-os/registry/oliviaAppRegistry";
import type { TabletAppId } from "@/lib/olivia/tablet/navigation";
import { getTabletApp, resolveTabletAppIconSource } from "./tabletApps";

export default function TabletAppIcon({ appId, size = 44 }: { appId: TabletAppId; size?: number }) {
  const source = resolveTabletAppIconSource(appId);
  const registryIcon = source.kind === "registry" ? getOliviaApp(source.appId)?.icon : null;
  const icon = registryIcon ?? (
    <SharedAppIcon
      name={source.kind === "shared" ? source.iconName : getTabletApp(appId).fallbackIcon}
      size={Math.round(size * 0.64)}
      aria-hidden
      focusable={false}
    />
  );

  return <OliviaOsIconTile icon={icon} size={size} active={false} />;
}
