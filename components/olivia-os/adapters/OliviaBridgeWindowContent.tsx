"use client";

import { useCallback } from "react";

import OliviaBridgeWorkspace from "@/components/olivia-bridge/OliviaBridgeWorkspace";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { DesktopWindowProvider, DesktopWindowRouteProvider } from "@/lib/desktopWindowContext";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";

export function OliviaBridgeWindowContent({ context }: { context?: WindowContext }) {
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const navigate = useCallback((href: string, title?: string, nextContext?: WindowContext) => {
    openApp({
      appId: "olivia-bridge",
      title: title ?? "Olivia Bridge",
      width: 1380,
      height: 820,
      context: { ...nextContext, routeHref: href },
    });
  }, [openApp]);

  return (
    <DesktopWindowProvider value={true}>
      <DesktopWindowRouteProvider value={{
        clientId: context?.clientId,
        workflowRunId: context?.projectId ?? context?.workflowRunId,
        routeHref: context?.routeHref,
        navigate,
      }}>
        <PhotoStudioExecutionProvider>
          <OliviaBridgeWorkspace
            clientId={context?.clientId}
            workflowRunId={context?.projectId ?? context?.workflowRunId}
          />
        </PhotoStudioExecutionProvider>
      </DesktopWindowRouteProvider>
    </DesktopWindowProvider>
  );
}
