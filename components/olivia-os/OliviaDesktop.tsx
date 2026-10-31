"use client";

import { useEffect, useRef, useState } from "react";
import { loadDesktopState, useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import { HomeDashboardDataProvider } from "@/components/dashboard/HomeDashboardData";
import { clearOliviaRootLaunchParams, type OliviaRootLaunch } from "@/lib/olivia/navigation/clientRoute";
import { requestOliviaDesktopExitConfirmation } from "@/lib/olivia/desktopExitGuard";
import { useOliviaDesktopContextBridge } from "./useOliviaDesktopContextBridge";
import { DesktopTopBar } from "./DesktopTopBar";
import { DesktopSurface } from "./DesktopSurface";
import { DesktopDock } from "./DesktopDock";
import { DesktopGlobalSearch } from "./DesktopGlobalSearch";
import { DesktopUtilityToast } from "./DesktopUtilityToast";
import { DesktopAppChatPanel } from "./DesktopAppChatPanel";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { DesktopShellErrorBoundary } from "./DesktopShellErrorBoundary";
import { PhotoTaskStatusBar } from "./PhotoTaskStatusBar";
import styles from "./OliviaDesktop.module.css";

function OliviaDesktopContent({ initialLaunch }: { initialLaunch?: OliviaRootLaunch | null }) {
  const [appChatMounted, setAppChatMounted] = useState(false);
  const handledInitialLaunchRef = useRef<OliviaRootLaunch | null>(null);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const activeWindow = useOliviaDesktopStore((state) => activeWindowId ? state.windows[activeWindowId] : undefined);
  const appChatOpen = useOliviaDesktopUtilityStore((state) => state.appChatOpen);
  const setAppChatOpen = useOliviaDesktopUtilityStore((state) => state.setAppChatOpen);

  useOliviaDesktopContextBridge();

  useEffect(() => {
    window.addEventListener("beforeunload", requestOliviaDesktopExitConfirmation);
    return () => window.removeEventListener("beforeunload", requestOliviaDesktopExitConfirmation);
  }, []);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    loadDesktopState(new Set(oliviaAppRegistry.map((app) => app.id)));
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    if (!initialLaunch || handledInitialLaunchRef.current === initialLaunch) return;
    handledInitialLaunchRef.current = initialLaunch;
    const app = oliviaAppRegistry.find((candidate) => candidate.id === initialLaunch.appId);
    if (!app) return;
    useOliviaDesktopStore.getState().openApp({
      appId: app.id,
      title: app.title,
      width: app.defaultSize.width,
      height: app.defaultSize.height,
      context: {
        clientId: initialLaunch.clientId,
        projectId: initialLaunch.workflowRunId,
        workflowRunId: initialLaunch.workflowRunId,
        routeHref: initialLaunch.routeHref ?? "/clients",
      },
    });
    window.history.replaceState(window.history.state, "", clearOliviaRootLaunchParams(window.location.href));
  }, [initialLaunch]);

  const showAppChat = Boolean(appChatOpen && activeWindowId !== "olivia-chat");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setAppChatOpen(!useOliviaDesktopUtilityStore.getState().appChatOpen);
        return;
      }
      if (event.key === "Escape" && useOliviaDesktopUtilityStore.getState().appChatOpen) {
        setAppChatOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setAppChatOpen]);

  useEffect(() => {
    if (showAppChat) {
      setAppChatMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setAppChatMounted(false), 340);
    return () => window.clearTimeout(timer);
  }, [showAppChat]);

  return (
    <div className={styles.desktop} data-home={!activeWindowId} data-olivia-desktop-root>
      <HomeDashboardDataProvider>
        <div className={styles.desktopBody} data-chat-open={showAppChat}>
          <section className={styles.desktopStage}>
            <DesktopTopBar />
            <DesktopSurface />
          </section>
          {appChatMounted ? <DesktopAppChatPanel open={showAppChat} screenTitle={activeWindow?.title ?? "홈"} onClose={() => setAppChatOpen(false)} /> : null}
        </div>
      </HomeDashboardDataProvider>
      <div className={styles.dockArea}><DesktopDock /></div>
      <DesktopGlobalSearch />
      <DesktopUtilityToast />
      <PhotoTaskStatusBar />
    </div>
  );
}

export default function OliviaDesktop({ initialLaunch }: { initialLaunch?: OliviaRootLaunch | null }) {
  return <DesktopShellErrorBoundary><OliviaDesktopContent initialLaunch={initialLaunch} /></DesktopShellErrorBoundary>;
}
