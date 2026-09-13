"use client";

import { useCallback, useEffect, useState } from "react";
import { buildTabletNavigationUrl, parseTabletNavigation, type TabletAppId } from "@/lib/olivia/tablet/navigation";
import TabletAppContent from "./TabletAppContent";
import TabletDock from "./TabletDock";
import TabletTopBar from "./TabletTopBar";
import { getTabletApp } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";

function currentApp(): TabletAppId {
  return parseTabletNavigation(window.location.search);
}

export default function OliviaTabletShell() {
  const [activeApp, setActiveApp] = useState<TabletAppId>(currentApp);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onPopState = () => setActiveApp(currentApp());
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const navigate = useCallback((app: TabletAppId, mode: "push" | "replace" = "push") => {
    const href = buildTabletNavigationUrl(window.location.href, app);
    window.history[mode === "replace" ? "replaceState" : "pushState"]({ oliviaTablet: true, app }, "", href);
    setActiveApp(app);
  }, []);

  const app = getTabletApp(activeApp);

  return (
    <main className={styles.shell} data-olivia-tablet-shell>
      <TabletTopBar app={app} onHome={() => navigate("home")} />
      <TabletAppContent activeApp={activeApp} onNavigate={navigate} />
      <TabletDock activeApp={activeApp} onNavigate={navigate} />
    </main>
  );
}
