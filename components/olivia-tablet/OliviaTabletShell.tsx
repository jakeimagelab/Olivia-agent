"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildTabletNavigationUrl,
  parseTabletNavigationState,
  type TabletAppId,
  type TabletNavigationContext,
  type TabletNavigationState,
} from "@/lib/olivia/tablet/navigation";
import TabletAppContent from "./TabletAppContent";
import TabletDock from "./TabletDock";
import TabletTopBar from "./TabletTopBar";
import { getTabletApp } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";

function currentNavigation(): TabletNavigationState {
  return parseTabletNavigationState(window.location.search);
}

export default function OliviaTabletShell() {
  const [navigation, setNavigation] = useState<TabletNavigationState>(currentNavigation);
  const activeApp = navigation.app;

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onPopState = () => setNavigation(currentNavigation());
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const navigate = useCallback((app: TabletAppId, context: TabletNavigationContext = {}) => {
    const href = buildTabletNavigationUrl(window.location.href, app, context);
    window.history.pushState({ oliviaTablet: true, app }, "", href);
    setNavigation({ app, ...context });
  }, []);

  const app = getTabletApp(activeApp);

  return (
    <main className={styles.shell} data-olivia-tablet-shell>
      <TabletTopBar app={app} onHome={() => navigate("home")} />
      <TabletAppContent activeApp={activeApp} navigation={navigation} onNavigate={navigate} />
      <TabletDock activeApp={activeApp} onNavigate={navigate} />
    </main>
  );
}
