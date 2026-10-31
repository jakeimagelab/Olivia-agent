"use client";

import VideoStudio from "@/components/video-studio/VideoStudio";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";

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
          onRouteChange={(href) => {
            const url = new URL(href, "https://olivia.local");
            const itemId = url.searchParams.get("tool") ?? url.searchParams.get("tab") ?? "video-studio";
            updateWindowContext("video-studio", { ...context, routeHref: href, featureItemId: itemId });
            emitShellSelection({
              sourceAppId: "video-studio",
              sourceWindowId: "video-studio",
              itemId,
              title: url.searchParams.get("tool") ?? url.searchParams.get("tab") ?? "영상작업실",
              subtitle: context?.projectName ?? "현재 영상 작업",
              next: "선택한 영상 도구의 원본과 처리 결과를 확인합니다.",
              appId: "video-studio",
              href,
              context: { ...context, routeHref: href, featureItemId: itemId },
              featureItemId: itemId,
            });
          }}
        />
      </PhotoStudioExecutionProvider>
    </DesktopWindowProvider>
  );
}
