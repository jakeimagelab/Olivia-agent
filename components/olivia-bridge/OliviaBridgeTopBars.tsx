"use client";

import {
  Check,
  ChevronRight,
  CircleAlert,
  FolderOpen,
  LoaderCircle,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { RefObject } from "react";

import type { BridgeFolderTrailItem } from "@/lib/photo-bridge/recentFolder";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";
import styles from "./OliviaBridgeWorkspace.module.css";

type SceneStatus = {
  status: string;
  stage: string;
  completed: number;
  total: number;
};

type AdobeMarkStatus = {
  total: number;
  read: number;
  rated: number;
  colored: number;
  failed: number;
  failedFileNames: string[];
  firstError?: string | null;
};

export function OliviaBridgeTopBars({
  hasActiveFolder,
  sceneStatus,
  connectionLabel,
  onOpenSceneReview,
  onOpenOlivia,
  folderSourceOpen,
  onOpenFolderSource,
  selectionSource,
  onSelectionSourceChange,
  adobeSelectionLoading,
  adobeMarkStatus,
  onRefreshAdobeMarks,
  remoteFolderPath,
  breadcrumbs,
  onOpenBreadcrumb,
  includeNestedJpgs,
  canToggleNestedJpgs,
  onNestedJpgsChange,
  visibleCount,
  totalCount,
  compactFilterButtonRef,
  compactFiltersOpen,
  onOpenCompactFilters,
  onOpenSelection,
  topNotice,
}: {
  hasActiveFolder: boolean;
  sceneStatus: SceneStatus;
  connectionLabel: "NAS 연결" | "Mac 연결" | "폴더 미연결";
  onOpenSceneReview: () => void;
  onOpenOlivia: () => void;
  folderSourceOpen: boolean;
  onOpenFolderSource: () => void;
  selectionSource: BridgeSelectionSource;
  onSelectionSourceChange: (source: BridgeSelectionSource) => void;
  adobeSelectionLoading: boolean;
  adobeMarkStatus: AdobeMarkStatus;
  onRefreshAdobeMarks: () => void;
  remoteFolderPath?: string;
  breadcrumbs: BridgeFolderTrailItem[];
  onOpenBreadcrumb: (index: number) => void;
  includeNestedJpgs: boolean;
  canToggleNestedJpgs: boolean;
  onNestedJpgsChange: (checked: boolean) => void;
  visibleCount: number;
  totalCount: number;
  compactFilterButtonRef: RefObject<HTMLButtonElement | null>;
  compactFiltersOpen: boolean;
  onOpenCompactFilters: () => void;
  onOpenSelection: () => void;
  topNotice: string;
}) {
  return (
    <>
      <header className={styles.bridgeBar}>
        <strong>Bridge</strong>
        <div className={styles.bridgeHeaderStatus}>
          {hasActiveFolder ? (
            <button
              type="button"
              className={`${styles.sceneStatusButton} ${sceneStatus.status === "complete" ? styles.sceneReady : sceneStatus.status === "error" ? styles.sceneFailed : ""}`}
              onClick={onOpenSceneReview}
              aria-label={sceneStatus.stage}
              title={sceneStatus.stage}
            >
              {sceneStatus.status === "running" ? <LoaderCircle className={styles.spin} size={15} /> : sceneStatus.status === "error" ? <CircleAlert size={15} /> : <Sparkles size={15} />}
              <span>{sceneStatus.status === "running" ? `${sceneStatus.completed}/${sceneStatus.total}` : sceneStatus.stage}</span>
            </button>
          ) : null}
          <span className={styles.connectionState}><i />{connectionLabel}</span>
          <button type="button" className={styles.oliviaEntry} onClick={onOpenOlivia}>Olivia</button>
        </div>
      </header>

      <div className={styles.pathBar}>
        <button
          type="button"
          className={styles.folderPickerButton}
          onClick={(event) => {
            event.stopPropagation();
            onOpenFolderSource();
          }}
          aria-haspopup="dialog"
          aria-expanded={folderSourceOpen}
        >
          <FolderOpen size={17} /> {hasActiveFolder ? "폴더 바꾸기" : "폴더 선택"}
        </button>
        <div className={styles.selectionSourceControl} role="group" aria-label="셀렉 기준">
          <span>셀렉 기준</span>
          {(["olivia", "adobe", "both"] as const).map((source) => (
            <button
              key={source}
              type="button"
              data-active={selectionSource === source ? "true" : undefined}
              aria-pressed={selectionSource === source}
              onClick={() => onSelectionSourceChange(source)}
            >
              {source === "olivia" ? "올리비아" : source === "adobe" ? "어도비" : "둘 다"}
            </button>
          ))}
        </div>
        {selectionSource !== "olivia" ? (
          <div
            className={styles.adobeMarkStatus}
            title={adobeMarkStatus.failedFileNames.length ? `실패: ${adobeMarkStatus.failedFileNames.join(", ")}${adobeMarkStatus.firstError ? ` · ${adobeMarkStatus.firstError}` : ""}` : undefined}
          >
            <span>{adobeSelectionLoading
              ? `어도비 별점 읽는 중… ${(adobeMarkStatus.read + adobeMarkStatus.failed).toLocaleString("ko-KR")}/${adobeMarkStatus.total.toLocaleString("ko-KR")}`
              : `어도비 별점 ${adobeMarkStatus.rated.toLocaleString("ko-KR")}장 · 컬러 ${adobeMarkStatus.colored.toLocaleString("ko-KR")}장`}</span>
            {adobeMarkStatus.failed ? <b>실패 {adobeMarkStatus.failed.toLocaleString("ko-KR")}장</b> : null}
            <button type="button" disabled={adobeSelectionLoading} onClick={onRefreshAdobeMarks}>다시 읽기</button>
          </div>
        ) : null}
        <div className={styles.breadcrumbs} aria-label="현재 폴더 경로">
          {remoteFolderPath ? <span>NAS · {remoteFolderPath}</span> : breadcrumbs.length ? breadcrumbs.map((item, index) => (
            <span key={`${item.name}-${index}`}>
              {index ? <ChevronRight size={12} /> : null}
              <button type="button" onClick={() => onOpenBreadcrumb(index)}>{item.name}</button>
            </span>
          )) : <span>작업할 촬영 폴더를 선택해 주세요.</span>}
        </div>
        <label className={styles.nestedJpgPathToggle}>
          <input
            type="checkbox"
            checked={includeNestedJpgs}
            disabled={!canToggleNestedJpgs}
            onChange={(event) => onNestedJpgsChange(event.currentTarget.checked)}
          />
          <span>하위 폴더 JPG 포함</span>
        </label>
        <span className={styles.fileCountSummary}>보이는 중 {visibleCount.toLocaleString("ko-KR")} · 전체 {totalCount.toLocaleString("ko-KR")}장</span>
        <button
          ref={compactFilterButtonRef}
          type="button"
          className={styles.compactFilterEntry}
          aria-expanded={compactFiltersOpen}
          aria-controls="olivia-bridge-folder-panel"
          onClick={onOpenCompactFilters}
        >
          <SlidersHorizontal size={14} /> 필터
        </button>
        <button type="button" className={styles.compactInspectorEntry} onClick={onOpenSelection}><Check size={14} /> 선택한 파일</button>
        {topNotice ? <span className={styles.topNotice} role="status">{topNotice}</span> : null}
      </div>
    </>
  );
}
