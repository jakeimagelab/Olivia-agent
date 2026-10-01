"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildTabletNavigationUrl,
  parseTabletNavigationState,
  type TabletAppId,
  type TabletNavigationContext,
  type TabletNavigationState,
} from "@/lib/olivia/tablet/navigation";
import { OliviaUiSurfaceProvider } from "@/lib/olivia/surfaceContext";
import TabletAppContent from "./TabletAppContent";
import TabletDock from "./TabletDock";
import TabletTopBar from "./TabletTopBar";
import { getTabletApp } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";
import GlobalRecordingBar from "@/components/voice/GlobalRecordingBar";
import { clearOliviaRootLaunchParams, type OliviaRootLaunch } from "@/lib/olivia/navigation/clientRoute";

function currentNavigation(): TabletNavigationState {
  return parseTabletNavigationState(window.location.search);
}

export default function OliviaTabletShell({ initialLaunch }: { initialLaunch?: OliviaRootLaunch | null }) {
  const [navigation, setNavigation] = useState<TabletNavigationState>(() => initialLaunch?.appId === "customer"
    ? { app: "customer", clientId: initialLaunch.clientId, workflowRunId: initialLaunch.workflowRunId }
    : currentNavigation());
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

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const syncViewportHeight = () => {
      root.style.setProperty("--olivia-visual-viewport-height", `${Math.round(viewport?.height ?? window.innerHeight)}px`);
    };

    syncViewportHeight();
    viewport?.addEventListener("resize", syncViewportHeight);
    viewport?.addEventListener("scroll", syncViewportHeight);
    window.addEventListener("orientationchange", syncViewportHeight);

    return () => {
      viewport?.removeEventListener("resize", syncViewportHeight);
      viewport?.removeEventListener("scroll", syncViewportHeight);
      window.removeEventListener("orientationchange", syncViewportHeight);
      root.style.removeProperty("--olivia-visual-viewport-height");
    };
  }, []);

  useEffect(() => {
    if (initialLaunch?.appId !== "customer") return;
    const url = new URL(clearOliviaRootLaunchParams(window.location.href, { keepClientId: true }), window.location.origin);
    url.searchParams.set("tabletApp", "customer");
    if (initialLaunch.workflowRunId) url.searchParams.set("workflowRunId", initialLaunch.workflowRunId);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [initialLaunch]);

  const navigate = useCallback((app: TabletAppId, context: TabletNavigationContext = {}) => {
    const href = buildTabletNavigationUrl(window.location.href, app, context);
    window.history.pushState({ oliviaTablet: true, app }, "", href);
    setNavigation({ app, ...context });
  }, []);

  const app = getTabletApp(activeApp);

  return (
    <OliviaUiSurfaceProvider value="tablet">
      <main className={styles.shell} data-olivia-tablet-shell>
        <TabletTopBar app={app} onHome={() => navigate("home")} />
        <TabletAppContent activeApp={activeApp} navigation={navigation} onNavigate={navigate} />
        <TabletDock activeApp={activeApp} onNavigate={navigate} />
        <GlobalRecordingBar surface="tablet" onOpenRecording={() => navigate("voice")} />
      </main>
    </OliviaUiSurfaceProvider>
  );
}
