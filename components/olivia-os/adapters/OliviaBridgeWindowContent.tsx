"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";

import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { DesktopWindowProvider, DesktopWindowRouteProvider } from "@/lib/desktopWindowContext";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";

const OliviaBridgeWorkspace = dynamic(() => import("@/components/olivia-bridge/OliviaBridgeWorkspace"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#5A7470", fontSize: 12 }}>Olivia Bridge를 준비하는 중...</div>,
});

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
