"use client";

import { useCallback } from "react";
import { getOliviaApp, resolveOliviaAppRoute } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { contextFromHref, mergeDefinedWindowContext } from "@/lib/olivia/desktop/windowContext";
import { attachOliviaChatToDocumentWindow, isChatLinkedDocumentWindow } from "@/lib/olivia/desktop/windowLifecycle";

export function useDesktopAppLauncher() {
  const openApp = useOliviaDesktopStore((state) => state.openApp);

  return useCallback((href: string, title?: string, context?: WindowContext) => {
    const resolved = resolveOliviaAppRoute(href);
    const resolvedHref = resolved?.href ?? href;
    const hrefContext = { ...contextFromHref(resolvedHref), routeHref: resolvedHref };
    if (resolved) {
      const app = resolved.app;
      const mergedContext = mergeDefinedWindowContext(hrefContext, context);
      const documentContext = ["quote", "contract", "conti"].includes(app.id)
        ? { ...mergedContext, documentId: mergedContext.resourceId, documentType: app.id }
        : mergedContext;
      openApp({
        appId: app.id,
        title: title && title !== app.title ? `${app.title} · ${title}` : app.title,
        width: app.defaultSize.width,
        height: app.defaultSize.height,
        context: Object.values(documentContext).some(Boolean) ? documentContext : undefined,
      });
      if (isChatLinkedDocumentWindow(useOliviaDesktopStore.getState().windows[app.id])) {
        attachOliviaChatToDocumentWindow(app.id);
      }
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
