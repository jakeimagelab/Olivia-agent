"use client";

import { ALL_TOOLS, groupToolsByCategory } from "@/lib/toolNav";
import { Icon, type IconName } from "@/components/Icon";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useDesktopAppLauncher } from "../../useDesktopAppLauncher";
import { AppIcon } from "../../AppIcon";
import { getOliviaApp } from "../../registry/oliviaAppRegistry";
import styles from "./AllAppsWindowContent.module.css";

const TOOL_ICON_BY_HREF: Record<string, IconName> = {
  "/memo": "memo",
  "/team-chat": "team-chat",
  "/calendar": "work-calendar",
  "/work-journal": "work-log",
  "/team": "workspace",
  "/marketing": "marketing-dashboard",
  "/quote": "quote",
  "/contract": "contract",
  "/conti": "storyboard",
  "/clients": "clients",
  "/select-galleries": "select-gallery",
  "/per": "per-reward",
  "/portal-admin": "client-portal",
  "/mailing": "mailing",
  "/photo-sorting": "photo-studio",
  "/select-match": "select-match",
  "/metadata-select": "metadata-select",
  "/raw-select": "raw-select",
  "/video-sorting": "video-sort",
  "/video-convert": "resolution-convert",
  "/photo-retouching": "retouch",
  "/broll-prompt": "broll-prompt",
  "/youtube-editing-conti": "youtube-storyboard",
  "/prompter": "prompter",
  "/report": "work-report",
  "/link-generator": "share-link",
  "/trash": "trash",
  "/daily-ideas": "idea",
  "/sns-manager": "promo-content",
  "/review-studio": "review-content",
  "/brand-analysis": "brand-audit",
  "/ai-trust-gap": "reverse-analysis",
  "/diagnosis": "image-diagnosis",
  "/hospital-brand-image-diagnosis": "brand-image-diagnosis",
  "/channel-analyzer": "channel-analysis",
  "/trend-dashboard": "trend-analysis",
  "/image-generator": "image-director",
  "/website-builder": "website-build",
  "/seo-delivery": "seo",
  "/library": "library",
};

export function AllAppsWindowContent() {
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const launchHref = useDesktopAppLauncher();
  const groups = groupToolsByCategory(ALL_TOOLS);

  const systemApps = [getOliviaApp("today"), getOliviaApp("olivia-chat")].filter((app) => app !== undefined);

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2>Desktop</h2>
        <div className={styles.grid}>
          {systemApps.map((app) => (
            <button type="button" key={app.id} onClick={() => openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height })}>
              <AppIcon icon={app.icon} size={42} /><span>{app.title}</span>
            </button>
          ))}
        </div>
      </section>
      {groups.map((group) => group.items.length ? (
        <section className={styles.section} key={group.category}>
          <h2>{group.label}</h2>
          <div className={styles.grid}>
            {group.items.map((tool) => (
              <button type="button" key={tool.href} onClick={() => launchHref(tool.href, tool.title)} title={tool.desc}>
                <AppIcon icon={<Icon name={TOOL_ICON_BY_HREF[tool.href] ?? "workspace"} size={24} aria-hidden focusable={false} />} size={42} /><span>{tool.title}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null)}
    </div>
  );
}
