"use client";

import { useCallback } from "react";
import { getOliviaApp, resolveOliviaAppRoute } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { contextFromHref, mergeDefinedWindowContext } from "@/lib/olivia/desktop/windowContext";

export function useDesktopAppLauncher() {
  const openApp = useOliviaDesktopStore((state) => state.openApp);

  return useCallback((href: string, title?: string, context?: WindowContext) => {
    const resolved = resolveOliviaAppRoute(href);
    const resolvedHref = resolved?.href ?? href;
    const hrefContext = { ...contextFromHref(resolvedHref), routeHref: resolvedHref };
    if (resolved) {
      const app = resolved.app;
      const mergedContext = mergeDefinedWindowContext(hrefContext, context);
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
    if (process.env.NODE_ENV !== "production") {
      console.warn("[OLIVIA NATIVE ROUTE] compatibility fallback", { href });
    }
    openApp({
      appId: compatibilityApp.id,
      title: title || "포토클리닉",
      width: compatibilityApp.defaultSize.width,
      height: compatibilityApp.defaultSize.height,
      context: { ...context, resourceId: href, resourceType: "route" },
    });
  }, [openApp]);
}
