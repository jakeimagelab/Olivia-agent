"use client";

import dynamic from "next/dynamic";

import PhotoStudioExecutionBar from "@/components/photo-workspace/PhotoStudioExecutionBar";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { DesktopWindowProvider, DesktopWindowRouteProvider } from "@/lib/desktopWindowContext";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

const PhotoRetouchingWorkspace = dynamic(
  () => import("@/app/(photo-studio)/photo-retouching/page"),
  {
    ssr: false,
    loading: () => <div style={{ padding: 24, color: "#5a7470", fontSize: 12 }}>사진보정을 준비하는 중...</div>,
  },
);

export function PhotoRetouchingWindowContent({ context }: { context?: WindowContext }) {
  return <DesktopWindowProvider value={true}>
    <DesktopWindowRouteProvider value={{ routeHref: context?.routeHref }}>
      <PhotoStudioExecutionProvider>
        <div style={{ width: "100%", height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden", background: "#f0f4f2" }}>
          <PhotoStudioExecutionBar />
          <div style={{ minHeight: 0, overflow: "auto" }}>
            <PhotoRetouchingWorkspace />
          </div>
        </div>
      </PhotoStudioExecutionProvider>
    </DesktopWindowRouteProvider>
  </DesktopWindowProvider>;
}
