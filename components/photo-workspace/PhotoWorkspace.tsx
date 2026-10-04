"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WorkPanel } from "@/components/workspace-shell/WorkPanel";
import { WorkspaceGrid } from "@/components/workspace-shell/WorkspaceGrid";
import { WorkspaceContent, WorkspaceShell } from "@/components/workspace-shell/WorkspaceShell";
import PhotoGuidePanel from "./PhotoGuidePanel";
import PhotoSelectWorkspace from "./PhotoSelectWorkspace";
import PhotoWorkspaceHeader from "./PhotoWorkspaceHeader";
import PhotoWorkspaceTabs from "./PhotoWorkspaceTabs";
import type { PhotoSelectMode, PhotoWorkspaceMode } from "./types";
import { resolvePhotoWorkspaceToolState } from "./photoWorkspaceToolState";
import styles from "./PhotoWorkspace.module.css";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import RemoteUnsupportedNotice from "./RemoteUnsupportedNotice";
import RemotePhotoOperationResultBanner from "./RemotePhotoOperationResultBanner";

const PhotoRawMatchWorkspace = dynamic(() => import("./PhotoRawMatchWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>RAW 매칭 도구를 불러오는 중...</div>,
});
const PhotoSortingWorkspace = dynamic(() => import("@/components/photo-classifier/PhotoSortingWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 분류 도구를 불러오는 중...</div>,
});
const PhotoTcutWorkspace = dynamic(() => import("./PhotoTcutWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>T컷 정리 도구를 불러오는 중...</div>,
});
const PhotoRetouchingWorkspace = dynamic(() => import("@/app/(photo-studio)/photo-retouching/page"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 보정 도구를 불러오는 중...</div>,
});
const PhotoResizeWorkspace = dynamic(() => import("./PhotoResizeWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 리사이즈 도구를 불러오는 중...</div>,
});
const PhotoRenameWorkspace = dynamic(() => import("./PhotoRenameWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>이름변경 도구를 불러오는 중...</div>,
});

const WORKSPACE_MODES = new Set<PhotoWorkspaceMode>(["select", "raw-match", "classification", "t-cut", "retouch", "resize", "rename"]);
const SELECT_MODES = new Set<PhotoSelectMode>(["ai", "manual", "client"]);

function PhotoWorkspaceContent({
  hideHeader = false,
  initialMode = "select",
  initialTool,
}: {
  hideHeader?: boolean;
  initialMode?: PhotoWorkspaceMode;
  initialTool?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toolState = resolvePhotoWorkspaceToolState(searchParams.get("tool"));
  const initialToolState = resolvePhotoWorkspaceToolState(initialTool);
  const rawMode = searchParams.get("mode") as PhotoWorkspaceMode | null;
  const rawSelectMode = searchParams.get("selectMode") as PhotoSelectMode | null;
  const rawMatchMethodParam = searchParams.get("rawMatchMethod");
  const remoteJobId = searchParams.get("remoteJobId");
  const mode = toolState?.mode ?? (rawMode && WORKSPACE_MODES.has(rawMode) ? rawMode : initialToolState?.mode ?? initialMode);
  const selectMode = toolState?.selectMode ?? (rawSelectMode && SELECT_MODES.has(rawSelectMode) ? rawSelectMode : initialToolState?.selectMode ?? "ai");
  const rawMatchMethod = toolState?.rawMatchMethod ?? (rawMatchMethodParam === "metadata" ? "metadata" : initialToolState?.rawMatchMethod ?? "filename");
  const { executionMode, currentLocalFolder, selectedJpgNames } = usePhotoStudioExecution();
  const remote = executionMode === "REMOTE_WORKER";
  const remoteUnavailable = remote && mode !== "classification" && mode !== "select";

  const updateQuery = (nextMode: PhotoWorkspaceMode, nextSelectMode = selectMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tool");
    if (nextMode !== "raw-match") params.delete("rawMatchMethod");
    params.set("mode", nextMode);
    params.set("selectMode", nextSelectMode);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <WorkspaceShell>
      <WorkspaceContent>
        {hideHeader ? null : <PhotoWorkspaceHeader />}
        <PhotoWorkspaceTabs value={mode} onChange={updateQuery} />
        <RemotePhotoOperationResultBanner jobId={remoteJobId} />
        <WorkspaceGrid
          forceSingleColumn={remoteUnavailable}
          guide={remoteUnavailable ? undefined : <PhotoGuidePanel mode={mode} selectMode={selectMode} />}
        >
          <WorkPanel
            tone="dark"
            role="tabpanel"
            id={`photo-workspace-panel-${mode}`}
            aria-labelledby={`photo-workspace-tab-${mode}`}
          >
            {remoteUnavailable ? <RemoteUnsupportedNotice feature={mode === "raw-match" ? "RAW 매칭" : mode === "t-cut" ? "T컷 정리" : mode === "retouch" ? "사진 보정" : mode === "rename" ? "이름변경" : "사진 리사이즈"} /> : null}
            {!remoteUnavailable && mode === "select" ? (
              <PhotoSelectWorkspace remote={remote} value={selectMode} onChange={(next) => updateQuery("select", next)} onStartRawMatch={() => updateQuery("raw-match")} />
            ) : null}
            {!remoteUnavailable && mode === "raw-match" ? <PhotoRawMatchWorkspace selectedJpgNames={selectedJpgNames} initialMethod={rawMatchMethod} /> : null}
            {!remoteUnavailable && mode === "classification" ? <PhotoSortingWorkspace mode="embedded" onOpenPhotoSelect={() => updateQuery("select", "manual")} /> : null}
            {!remoteUnavailable && mode === "t-cut" ? <PhotoTcutWorkspace rootDir={currentLocalFolder} /> : null}
            {!remoteUnavailable && mode === "retouch" ? <PhotoRetouchingWorkspace /> : null}
            {!remoteUnavailable && mode === "resize" ? <PhotoResizeWorkspace /> : null}
            {!remoteUnavailable && mode === "rename" ? <PhotoRenameWorkspace rootDir={currentLocalFolder} /> : null}
          </WorkPanel>
        </WorkspaceGrid>
      </WorkspaceContent>
    </WorkspaceShell>
  );
}

export default function PhotoWorkspace({
  hideHeader = false,
  initialMode = "select",
  initialTool,
}: {
  hideHeader?: boolean;
  initialMode?: PhotoWorkspaceMode;
  initialTool?: string;
} = {}) {
  return (
    <Suspense fallback={<div className={styles.workspaceLoading}>사진작업실을 준비하는 중...</div>}>
      <PhotoWorkspaceContent hideHeader={hideHeader} initialMode={initialMode} initialTool={initialTool} />
    </Suspense>
  );
}
