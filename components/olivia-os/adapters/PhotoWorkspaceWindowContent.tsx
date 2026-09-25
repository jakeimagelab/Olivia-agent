"use client";

import dynamic from "next/dynamic";

import PhotoStudioExecutionBar from "@/components/photo-workspace/PhotoStudioExecutionBar";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

// PhotoWorkspace는 독립 페이지에서 자체 제목을 그리지만 OS AppWindow에는 이미 제목 표시줄이
// 있다. 창에서는 hideHeader를 명시하고 기능 탭부터 렌더한다.
const PhotoWorkspace = dynamic(() => import("@/components/photo-workspace/PhotoWorkspace"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>사진작업실을 준비하는 중...</div>,
});

export function PhotoWorkspaceWindowContent({ context }: { context?: WindowContext }) {
  const routeHref = context?.routeHref;
  const initialTool = routeHref ? new URL(routeHref, "https://olivia.local").searchParams.get("tool") ?? undefined : undefined;
  return (
    <DesktopWindowProvider value={true}>
      <PhotoStudioExecutionProvider>
        <PhotoStudioExecutionBar />
        <PhotoWorkspace hideHeader initialTool={initialTool} />
      </PhotoStudioExecutionProvider>
    </DesktopWindowProvider>
  );
}
