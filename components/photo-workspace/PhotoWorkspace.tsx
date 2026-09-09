"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import PhotoGuidePanel from "./PhotoGuidePanel";
import PhotoSelectWorkspace from "./PhotoSelectWorkspace";
import PhotoWorkspaceHeader from "./PhotoWorkspaceHeader";
import PhotoWorkspaceTabs from "./PhotoWorkspaceTabs";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import type { PhotoSelectMode, PhotoWorkspaceMode, RawMatchView } from "./types";
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

const WORKSPACE_MODES = new Set<PhotoWorkspaceMode>(["select", "metadata-select", "raw-match", "classification", "retouch"]);
const SELECT_MODES = new Set<PhotoSelectMode>(["ai", "manual", "client"]);
const RAW_MATCH_VIEWS = new Set<RawMatchView>(["ai-cull", "match"]);

function PhotoWorkspaceContent() {
  const contentRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toolState = resolvePhotoWorkspaceToolState(searchParams.get("tool"));
  const rawMode = searchParams.get("mode") as PhotoWorkspaceMode | null;
  const rawSelectMode = searchParams.get("selectMode") as PhotoSelectMode | null;
  const rawRawMatchView = searchParams.get("rawMatchView") as RawMatchView | null;
  const mode = toolState?.mode ?? (rawMode && WORKSPACE_MODES.has(rawMode) ? rawMode : "select");
  const selectMode = toolState?.selectMode ?? (rawSelectMode && SELECT_MODES.has(rawSelectMode) ? rawSelectMode : "ai");
  const rawMatchView = toolState?.rawMatchView ?? (rawRawMatchView && RAW_MATCH_VIEWS.has(rawRawMatchView) ? rawRawMatchView : "ai-cull");

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const nextCompact = content.clientWidth < 900;
      setCompact((current) => current === nextCompact ? current : nextCompact);
      if (!nextCompact) setGuideOpen(false);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const updateQuery = (nextMode: PhotoWorkspaceMode, nextSelectMode = selectMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tool");
    params.set("mode", nextMode);
    params.set("selectMode", nextSelectMode);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const updateRawMatchView = (next: RawMatchView) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tool");
    params.set("mode", "raw-match");
    params.set("rawMatchView", next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className={styles.page}>
      <main ref={contentRef} className={styles.content}>
        <PhotoWorkspaceHeader />
        <PhotoWorkspaceTabs value={mode} onChange={updateQuery} />
        {compact ? (
          <button
            type="button"
            className={styles.guideToggle}
            aria-expanded={guideOpen}
            aria-controls="photo-workspace-guide"
            onClick={() => setGuideOpen((open) => !open)}
          >
            {guideOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            {guideOpen ? "사용 가이드 닫기" : "사용 가이드 보기"}
          </button>
        ) : null}
        <div className={`${styles.workspaceGrid} ${compact ? styles.workspaceGridCompact : ""}`}>
          <section
            className={styles.workPanel}
            role="tabpanel"
            id={`photo-workspace-panel-${mode}`}
            aria-labelledby={`photo-workspace-tab-${mode}`}
          >
            {mode === "select" ? (
              <PhotoSelectWorkspace value={selectMode} onChange={(next) => updateQuery("select", next)} onStartRawMatch={() => updateQuery("raw-match")} />
            ) : null}
            {mode === "metadata-select" ? <MetadataSelectWorkspace /> : null}
            {mode === "raw-match" ? (
              <>
                <SegmentedTabs
                  ariaLabel="AI 컷 정리 / RAW 매칭 선택"
                  value={rawMatchView}
                  onChange={updateRawMatchView}
                  items={[
                    { value: "ai-cull", label: "AI 컷 정리", id: "raw-match-view-ai-cull", panelId: "raw-match-panel" },
                    { value: "match", label: "RAW 매칭", id: "raw-match-view-match", panelId: "raw-match-panel" },
                  ]}
                  style={{ marginBottom: 14 }}
                />
                <div id="raw-match-panel">
                  {rawMatchView === "ai-cull" ? <RawSelectWorkspace /> : <SelectMatchWorkspace embedded initialView="raw" />}
                </div>
              </>
            ) : null}
            {mode === "classification" ? <PhotoSortingWorkspace mode="embedded" /> : null}
            {mode === "retouch" ? <PhotoRetouchingWorkspace /> : null}
          </section>
          {!compact || guideOpen ? <PhotoGuidePanel mode={mode} selectMode={selectMode} rawMatchView={rawMatchView} /> : null}
        </div>
      </main>
    </div>
  );
}

export default function PhotoWorkspace() {
  return <Suspense fallback={<div className={styles.workspaceLoading}>사진작업실을 준비하는 중...</div>}><PhotoWorkspaceContent /></Suspense>;
}
