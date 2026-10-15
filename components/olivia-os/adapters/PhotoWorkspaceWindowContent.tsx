"use client";

import dynamic from "next/dynamic";

import PhotoStudioExecutionBar from "@/components/photo-workspace/PhotoStudioExecutionBar";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";
import type { PhotoFileOpsMode, PhotoSelectMode, PhotoWorkspaceMode } from "@/components/photo-workspace/types";
import { resolveLegacyPhotoWorkspaceMode } from "@/components/photo-workspace/photoWorkspaceToolState";

// PhotoWorkspace는 독립 페이지에서 자체 제목을 그리지만 OS AppWindow에는 이미 제목 표시줄이
// 있다. 창에서는 hideHeader를 명시하고 기능 탭부터 렌더한다.
const PhotoWorkspace = dynamic(() => import("@/components/photo-workspace/PhotoWorkspace"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>사진작업실을 준비하는 중...</div>,
});

export function PhotoWorkspaceWindowContent({ context }: { context?: WindowContext }) {
  const routeHref = context?.routeHref;
  const route = routeHref ? new URL(routeHref, "https://olivia.local") : null;
  const initialTool = route?.searchParams.get("tool") ?? undefined;
  const modeParam = route?.searchParams.get("mode");
  const legacyMode = resolveLegacyPhotoWorkspaceMode(modeParam);
  const validModes: readonly string[] = ["plan", "jpg-prep", "select", "raw-match", "classification", "file-ops", "retouch"];
  const selectModeParam = route?.searchParams.get("selectMode");
  const fileOpsModeParam = route?.searchParams.get("fileOpsMode");
  const initialMode = route?.searchParams.get("tab") === "plan"
    ? "plan"
    : legacyMode?.mode ?? (modeParam && validModes.includes(modeParam) ? modeParam as PhotoWorkspaceMode : null);
  const initialSelectMode = legacyMode?.selectMode
    ?? (selectModeParam && ["ai", "manual", "client", "tcut"].includes(selectModeParam) ? selectModeParam as PhotoSelectMode : null);
  const initialFileOpsMode = legacyMode?.fileOpsMode
    ?? (fileOpsModeParam && ["resize", "rename"].includes(fileOpsModeParam) ? fileOpsModeParam as PhotoFileOpsMode : null);
  return (
    <DesktopWindowProvider value={true}>
      <PhotoStudioExecutionProvider>
        <PhotoStudioExecutionBar />
        <PhotoWorkspace
          hideHeader
          initialMode={initialMode ?? undefined}
          initialTool={initialTool}
          initialSelectMode={initialSelectMode ?? undefined}
          initialFileOpsMode={initialFileOpsMode ?? undefined}
          clientId={context?.clientId}
          workflowRunId={context?.projectId ?? context?.workflowRunId}
          resourceId={context?.resourceId ?? context?.documentId}
        />
      </PhotoStudioExecutionProvider>
    </DesktopWindowProvider>
  );
}
