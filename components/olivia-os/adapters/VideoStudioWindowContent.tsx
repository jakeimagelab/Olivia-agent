"use client";

import VideoStudio from "@/components/video-studio/VideoStudio";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

export function VideoStudioWindowContent({ context }: { context?: WindowContext }) {
  const routeHref = context?.routeHref;
  const routeUrl = routeHref ? new URL(routeHref, "https://olivia.local") : null;
  const initialTab = routeUrl?.searchParams.get("tab");
  const initialTool = routeUrl?.searchParams.get("tool");
  const updateWindowContext = useOliviaDesktopStore((state) => state.updateWindowContext);
  return (
    <DesktopWindowProvider value={true}>
      <PhotoStudioExecutionProvider>
        <VideoStudio
          hideHeader
          initialTab={initialTab}
          initialTool={initialTool}
          onRouteChange={(href) => updateWindowContext("video-studio", { ...context, routeHref: href })}
        />
      </PhotoStudioExecutionProvider>
    </DesktopWindowProvider>
  );
}
