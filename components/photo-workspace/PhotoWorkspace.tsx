"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { WorkPanel } from "@/components/workspace-shell/WorkPanel";
import { WorkspaceGrid } from "@/components/workspace-shell/WorkspaceGrid";
import { WorkspaceContent, WorkspaceShell } from "@/components/workspace-shell/WorkspaceShell";
import PhotoGuidePanel from "./PhotoGuidePanel";
import PhotoSelectWorkspace from "./PhotoSelectWorkspace";
import PhotoWorkspaceHeader from "./PhotoWorkspaceHeader";
import PhotoWorkspaceTabs from "./PhotoWorkspaceTabs";
import type { PhotoFileOpsMode, PhotoSelectMode, PhotoWorkspaceMode } from "./types";
import {
  canonicalizePhotoWorkspaceParams,
  resolveLegacyPhotoWorkspaceMode,
  resolvePhotoWorkspaceToolState,
} from "./photoWorkspaceToolState";
import styles from "./PhotoWorkspace.module.css";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import RemoteUnsupportedNotice from "./RemoteUnsupportedNotice";
import RemotePhotoOperationResultBanner from "./RemotePhotoOperationResultBanner";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

const PhotoRawMatchWorkspace = dynamic(() => import("./PhotoRawMatchWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>RAW 매칭 도구를 불러오는 중...</div>,
});
const PhotoSortingWorkspace = dynamic(() => import("@/components/photo-classifier/PhotoSortingWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 분류 도구를 불러오는 중...</div>,
});
const PhotoJpgPrepWorkspace = dynamic(() => import("./PhotoJpgPrepWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>JPG정리 도구를 불러오는 중...</div>,
});
const PhotoRetouchingWorkspace = dynamic(() => import("@/app/(photo-studio)/photo-retouching/page"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 보정 도구를 불러오는 중...</div>,
});
const PhotoFileOpsWorkspace = dynamic(() => import("./PhotoFileOpsWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>파일 정리 도구를 불러오는 중...</div>,
});

const WORKSPACE_MODES = new Set<PhotoWorkspaceMode>(["jpg-prep", "select", "raw-match", "classification", "file-ops", "retouch"]);
const SELECT_MODES = new Set<PhotoSelectMode>(["ai", "manual", "client", "tcut"]);
const FILE_OPS_MODES = new Set<PhotoFileOpsMode>(["resize", "rename"]);

export type PhotoWorkspaceEmbeddedToolProps = {
  mode: PhotoWorkspaceMode;
  selectMode?: PhotoSelectMode;
  fileOpsMode?: PhotoFileOpsMode;
  rawMatchMethod?: "filename" | "metadata";
};

/**
 * Olivia Bridge에서 기존 사진작업실 엔진을 중복 구현하지 않고 불러오는 얇은 연결면이다.
 * 폴더와 JPG 선택은 PhotoStudioExecutionContext에서 그대로 이어받고, 라우트나 작업실 탭은
 * 건드리지 않는다. 따라서 도구를 닫아도 Bridge의 탐색 상태가 유지된다.
 */
export function PhotoWorkspaceEmbeddedTool({
  mode: initialMode,
  selectMode: initialSelectMode = "manual",
  fileOpsMode: initialFileOpsMode = "resize",
  rawMatchMethod = "filename",
}: PhotoWorkspaceEmbeddedToolProps) {
  const [mode, setMode] = useState(initialMode);
  const [selectMode, setSelectMode] = useState(initialSelectMode);
  const [fileOpsMode, setFileOpsMode] = useState(initialFileOpsMode);
  const { currentLocalFolder, selectedJpgNames } = usePhotoStudioExecution();

  return (
    <WorkPanel tone="dark" className={styles.embeddedToolPanel}>
      {mode === "select" ? (
        <PhotoSelectWorkspace
          remote={false}
          bridgeEmbedded
          value={selectMode}
          onChange={setSelectMode}
          onStartRawMatch={() => setMode("raw-match")}
        />
      ) : null}
      {mode === "jpg-prep" ? <PhotoJpgPrepWorkspace bridgeEmbedded onOpenPhotoSelect={() => { setSelectMode("manual"); setMode("select"); }} /> : null}
      {mode === "raw-match" ? (
        <div className={styles.workspaceToolSurface}>
          <header className={styles.workspaceToolHeader}>
            <span className={styles.workspaceToolHeaderIcon}><Link2 size={18} aria-hidden="true" /></span>
            <span>
              <strong>RAW 매칭</strong>
              <small>Bridge에서 선택한 JPG와 RAW 원본을 파일명 또는 촬영시간으로 연결합니다.</small>
            </span>
            <span className={styles.workspaceToolFolder}>현재 작업 폴더: <b>{currentLocalFolder?.name ?? "선택 안 됨"}</b></span>
          </header>
          <PhotoRawMatchWorkspace bridgeLinked selectedJpgNames={selectedJpgNames} initialMethod={rawMatchMethod} />
        </div>
      ) : null}
      {mode === "classification" ? <PhotoSortingWorkspace mode="embedded" onOpenPhotoSelect={() => { setSelectMode("manual"); setMode("select"); }} /> : null}
      {mode === "retouch" ? <DesktopWindowProvider value={true}><PhotoRetouchingWorkspace /></DesktopWindowProvider> : null}
      {mode === "file-ops" ? <PhotoFileOpsWorkspace value={fileOpsMode} onChange={setFileOpsMode} /> : null}
    </WorkPanel>
  );
}

function PhotoWorkspaceContent({
  hideHeader = false,
  initialMode = "jpg-prep",
  initialTool,
  initialSelectMode,
  initialFileOpsMode,
}: {
  hideHeader?: boolean;
  initialMode?: PhotoWorkspaceMode;
  initialTool?: string;
  initialSelectMode?: PhotoSelectMode;
  initialFileOpsMode?: PhotoFileOpsMode;
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toolState = resolvePhotoWorkspaceToolState(searchParams.get("tool"));
  const initialToolState = resolvePhotoWorkspaceToolState(initialTool);
  const rawMode = searchParams.get("mode") as PhotoWorkspaceMode | null;
  const legacyModeState = resolveLegacyPhotoWorkspaceMode(searchParams.get("mode"));
  const rawTab = searchParams.get("tab");
  const rawSelectMode = searchParams.get("selectMode") as PhotoSelectMode | null;
  const rawFileOpsMode = searchParams.get("fileOpsMode") as PhotoFileOpsMode | null;
  const rawMatchMethodParam = searchParams.get("rawMatchMethod");
  const remoteJobId = searchParams.get("remoteJobId");
  const legacyContiLink = rawTab === "plan" || searchParams.get("tool") === "conti";
  const mode = toolState?.mode ?? legacyModeState?.mode ?? (rawMode && WORKSPACE_MODES.has(rawMode) ? rawMode : initialToolState?.mode ?? initialMode);
  const selectMode = toolState?.selectMode ?? (rawSelectMode && SELECT_MODES.has(rawSelectMode) ? rawSelectMode : initialToolState?.selectMode ?? initialSelectMode ?? "ai");
  const fileOpsMode = toolState?.fileOpsMode ?? legacyModeState?.fileOpsMode ?? (rawFileOpsMode && FILE_OPS_MODES.has(rawFileOpsMode) ? rawFileOpsMode : initialToolState?.fileOpsMode ?? initialFileOpsMode ?? "resize");
  const rawMatchMethod = toolState?.rawMatchMethod ?? (rawMatchMethodParam === "metadata" ? "metadata" : initialToolState?.rawMatchMethod ?? "filename");
  const { executionMode, currentLocalFolder, selectedJpgNames } = usePhotoStudioExecution();
  const remote = executionMode === "REMOTE_WORKER";
  const remoteUnavailable = remote && mode !== "jpg-prep" && mode !== "classification" && mode !== "select";

  useEffect(() => {
    if (!legacyContiLink) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    params.delete("tool");
    params.delete("mode");
    params.delete("selectMode");
    params.delete("fileOpsMode");
    const suffix = params.toString();
    router.replace(`/conti${suffix ? `?${suffix}` : ""}`, { scroll: false });
  }, [legacyContiLink, router, searchParams]);

  useEffect(() => {
    if (legacyContiLink) return;
    const canonical = canonicalizePhotoWorkspaceParams(new URLSearchParams(searchParams.toString()));
    if (!canonical) return;
    router.replace(`${pathname}?${canonical.toString()}`, { scroll: false });
  }, [legacyContiLink, pathname, router, searchParams]);

  const updateQuery = (nextMode: PhotoWorkspaceMode, nextSelectMode = selectMode, nextFileOpsMode = fileOpsMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    params.delete("tool");
    params.set("mode", nextMode);
    if (nextMode === "select") params.set("selectMode", nextSelectMode);
    else params.delete("selectMode");
    if (nextMode === "file-ops") params.set("fileOpsMode", nextFileOpsMode);
    else params.delete("fileOpsMode");
    if (nextMode !== "raw-match") params.delete("rawMatchMethod");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (legacyContiLink) return <div className={styles.workspaceLoading}>촬영 콘티로 이동하는 중...</div>;

  return (
    <WorkspaceShell>
      <WorkspaceContent>
        {hideHeader ? null : <PhotoWorkspaceHeader />}
        <PhotoWorkspaceTabs value={mode} onChange={updateQuery} remote={remote} />
        <RemotePhotoOperationResultBanner jobId={remoteJobId} />
        <WorkspaceGrid
          forceSingleColumn={remoteUnavailable}
          guide={remoteUnavailable ? undefined : <PhotoGuidePanel mode={mode} selectMode={selectMode} fileOpsMode={fileOpsMode} />}
        >
          <WorkPanel
            tone="dark"
            role="tabpanel"
            id={`photo-workspace-panel-${mode}`}
            aria-labelledby={`photo-workspace-tab-${mode}`}
          >
            {remoteUnavailable ? <RemoteUnsupportedNotice feature={mode === "raw-match" ? "RAW 매칭" : mode === "retouch" ? "사진 보정" : "파일 정리"} /> : null}
            {!remoteUnavailable && mode === "select" ? (
              <PhotoSelectWorkspace remote={remote} value={selectMode} onChange={(next) => updateQuery("select", next)} onStartRawMatch={() => updateQuery("raw-match")} />
            ) : null}
            {!remoteUnavailable && mode === "jpg-prep" ? <PhotoJpgPrepWorkspace onOpenPhotoSelect={() => updateQuery("select", "manual")} /> : null}
            {!remoteUnavailable && mode === "raw-match" ? (
              <div className={styles.workspaceToolSurface}>
                <header className={styles.workspaceToolHeader}>
                  <span className={styles.workspaceToolHeaderIcon}><Link2 size={18} aria-hidden="true" /></span>
                  <span>
                    <strong>RAW 매칭</strong>
                    <small>선택한 JPG와 RAW 원본을 파일명 또는 촬영시간으로 연결합니다.</small>
                  </span>
                  <span className={styles.workspaceToolFolder}>현재 작업 폴더: <b>{currentLocalFolder?.name ?? "선택 안 됨"}</b></span>
                </header>
                <PhotoRawMatchWorkspace selectedJpgNames={selectedJpgNames} initialMethod={rawMatchMethod} />
                <footer className={styles.workspaceToolActions}>JPG 선택 방식과 RAW 원본 위치를 지정하면 매칭을 시작할 수 있습니다.</footer>
              </div>
            ) : null}
            {!remoteUnavailable && mode === "classification" ? <PhotoSortingWorkspace mode="embedded" onOpenPhotoSelect={() => updateQuery("select", "manual")} /> : null}
            {!remoteUnavailable && mode === "retouch" ? <DesktopWindowProvider value={true}><PhotoRetouchingWorkspace /></DesktopWindowProvider> : null}
            {!remoteUnavailable && mode === "file-ops" ? <PhotoFileOpsWorkspace value={fileOpsMode} onChange={(next) => updateQuery("file-ops", selectMode, next)} /> : null}
          </WorkPanel>
        </WorkspaceGrid>
      </WorkspaceContent>
    </WorkspaceShell>
  );
}

export default function PhotoWorkspace({
  hideHeader = false,
  initialMode = "jpg-prep",
  initialTool,
  initialSelectMode,
  initialFileOpsMode,
  clientId,
  workflowRunId,
  resourceId,
}: {
  hideHeader?: boolean;
  initialMode?: PhotoWorkspaceMode;
  initialTool?: string;
  initialSelectMode?: PhotoSelectMode;
  initialFileOpsMode?: PhotoFileOpsMode;
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
} = {}) {
  return (
    <Suspense fallback={<div className={styles.workspaceLoading}>사진작업실을 준비하는 중...</div>}>
      <PhotoWorkspaceContent
        hideHeader={hideHeader}
        initialMode={initialMode}
        initialTool={initialTool}
        initialSelectMode={initialSelectMode}
        initialFileOpsMode={initialFileOpsMode}
        clientId={clientId}
        workflowRunId={workflowRunId}
        resourceId={resourceId}
      />
    </Suspense>
  );
}
