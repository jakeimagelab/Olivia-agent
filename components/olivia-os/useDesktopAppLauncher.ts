"use client";

import { useCallback } from "react";
import { getOliviaApp, getOliviaAppByRoute } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";

function contextFromHref(href: string): WindowContext {
  const query = href.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  return {
    clientId: params.get("clientId") ?? params.get("id") ?? undefined,
    projectId: params.get("projectId") ?? params.get("workflowRunId") ?? undefined,
  };
}

export function useDesktopAppLauncher() {
  const openApp = useOliviaDesktopStore((state) => state.openApp);

  return useCallback((href: string, title?: string, context?: WindowContext) => {
    const app = getOliviaAppByRoute(href);
    const hrefContext = contextFromHref(href);
    if (app) {
      const mergedContext = { ...hrefContext, ...context };
      openApp({
        appId: app.id,
        title: title && title !== app.title ? `${app.title} · ${title}` : app.title,
        width: app.defaultSize.width,
        height: app.defaultSize.height,
        context: Object.values(mergedContext).some(Boolean) ? mergedContext : undefined,
      });
      return;
    }

    const compatibilityApp = getOliviaApp("legacy-route");
    if (!compatibilityApp) return;
    openApp({
      appId: compatibilityApp.id,
      title: title || "포토클리닉",
      width: compatibilityApp.defaultSize.width,
      height: compatibilityApp.defaultSize.height,
      context: { ...context, resourceId: href, resourceType: "route" },
    });
  }, [openApp]);
}
