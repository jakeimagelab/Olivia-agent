"use client";

import { useRouter } from "next/navigation";
import { ALL_TOOLS, groupToolsByCategory } from "@/lib/toolNav";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { AppIcon } from "../../AppIcon";
import { getOliviaAppByRoute, getOliviaApp } from "../../registry/oliviaAppRegistry";
import styles from "./AllAppsWindowContent.module.css";

export function AllAppsWindowContent() {
  const router = useRouter();
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const groups = groupToolsByCategory(ALL_TOOLS);

  const launch = (href: string) => {
    const app = getOliviaAppByRoute(href);
    if (app) {
      openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height });
      return;
    }
    router.push(href);
  };

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
              <button type="button" key={tool.href} onClick={() => launch(tool.href)} title={tool.desc}>
                <AppIcon icon={<tool.icon size={24} />} size={42} /><span>{tool.title}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null)}
    </div>
  );
}
