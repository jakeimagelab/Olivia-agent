"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import PhotoGuidePanel from "./PhotoGuidePanel";
import PhotoSelectWorkspace from "./PhotoSelectWorkspace";
import PhotoWorkspaceHeader from "./PhotoWorkspaceHeader";
import PhotoWorkspaceTabs from "./PhotoWorkspaceTabs";
import type { PhotoSelectMode, PhotoWorkspaceMode } from "./types";
import { resolvePhotoWorkspaceToolState } from "./photoWorkspaceToolState";
import styles from "./PhotoWorkspace.module.css";

const SelectMatchWorkspace = dynamic(() => import("./SelectMatchWorkspace").then((module) => module.SelectMatchWorkspace), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>RAW 매칭 도구를 불러오는 중...</div>,
});
const PhotoSortingWorkspace = dynamic(() => import("@/components/photo-classifier/PhotoSortingWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 분류 도구를 불러오는 중...</div>,
});
const VideoConvertWorkspace = dynamic(() => import("./VideoConvertWorkspace").then((module) => module.VideoConvertWorkspace), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>파일 변환 도구를 불러오는 중...</div>,
});
const MetadataSelectWorkspace = dynamic(() => import("@/app/metadata-select/page"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>메타데이터 매칭 도구를 불러오는 중...</div>,
});
const RawSelectWorkspace = dynamic(() => import("@/app/(photo-studio)/raw-select/page"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>AI 컷 정리 도구를 불러오는 중...</div>,
});
const PhotoRetouchingWorkspace = dynamic(() => import("@/app/(photo-studio)/photo-retouching/page"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 보정 도구를 불러오는 중...</div>,
});

const WORKSPACE_MODES = new Set<PhotoWorkspaceMode>(["select", "raw-match", "classification", "conversion"]);
const SELECT_MODES = new Set<PhotoSelectMode>(["ai", "manual", "client"]);

function PhotoWorkspaceContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toolState = resolvePhotoWorkspaceToolState(searchParams.get("tool"));
  const rawMode = searchParams.get("mode") as PhotoWorkspaceMode | null;
  const rawSelectMode = searchParams.get("selectMode") as PhotoSelectMode | null;
  const mode = toolState?.mode ?? (rawMode && WORKSPACE_MODES.has(rawMode) ? rawMode : "select");
  const selectMode = toolState?.selectMode ?? (rawSelectMode && SELECT_MODES.has(rawSelectMode) ? rawSelectMode : "ai");

  const updateQuery = (nextMode: PhotoWorkspaceMode, nextSelectMode = selectMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tool");
    params.set("mode", nextMode);
    params.set("selectMode", nextSelectMode);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className={styles.page}>
      <main className={styles.content}>
        <PhotoWorkspaceHeader />
        <PhotoWorkspaceTabs value={mode} onChange={updateQuery} />
        <div className={styles.workspaceGrid}>
          <section
            className={styles.workPanel}
            role="tabpanel"
            id={`photo-workspace-panel-${mode}`}
            aria-labelledby={`photo-workspace-tab-${mode}`}
          >
            {searchParams.get("tool") === "metadata-match" ? <MetadataSelectWorkspace /> : null}
            {searchParams.get("tool") === "ai-cull" ? <RawSelectWorkspace /> : null}
            {searchParams.get("tool") === "retouch" ? <PhotoRetouchingWorkspace /> : null}
            {mode === "select" && !["metadata-match", "ai-cull", "retouch"].includes(searchParams.get("tool") ?? "") ? (
              <PhotoSelectWorkspace value={selectMode} onChange={(next) => updateQuery("select", next)} onStartRawMatch={() => updateQuery("raw-match")} />
            ) : null}
            {mode === "raw-match" ? <SelectMatchWorkspace embedded initialView="raw" /> : null}
            {mode === "classification" ? <PhotoSortingWorkspace mode="embedded" /> : null}
            {mode === "conversion" ? <VideoConvertWorkspace embedded /> : null}
          </section>
          <PhotoGuidePanel mode={mode} selectMode={selectMode} tool={searchParams.get("tool")} />
        </div>
      </main>
    </div>
  );
}

export default function PhotoWorkspace() {
  return <Suspense fallback={<div className={styles.workspaceLoading}>사진작업실을 준비하는 중...</div>}><PhotoWorkspaceContent /></Suspense>;
}
