"use client";

import { ChevronRight, Folder, FolderOpen, Sparkles, X } from "lucide-react";
import { memo } from "react";
import type { RefObject } from "react";

import PhotoQualityJobProgressView from "@/components/photo-quality/PhotoQualityJobProgress";
import type { BridgeFolderScan } from "@/lib/photo-bridge/bridgeFiles";
import type { BridgeSelectionView } from "@/lib/photo-bridge/labels";
import type { PhotoQualityFlag } from "@/lib/photo-quality/types";
import type { CustomerSelectionComparisonFilter } from "@/lib/select-gallery/customerBridge";
import styles from "./OliviaBridgeWorkspace.module.css";

export type BridgeWorkspaceFileFilter = "all" | "jpg" | "raw" | "sidecar" | BridgeSelectionView | "excluded";
export type BridgeWorkspaceQualityFilter = "all" | PhotoQualityFlag | "needs_review" | "normal";

type FilterItem = { key: BridgeWorkspaceFileFilter; label: string; count: number };

export const OliviaBridgeFolderPanel = memo(function OliviaBridgeFolderPanel({
  panelRef,
  compactOpen,
  onCloseCompact,
  rootName,
  rootCount,
  canOpenRoot,
  onOpenRoot,
  includeNestedJpgs,
  canToggleNestedJpgs,
  nestedJpgCount,
  onNestedJpgsChange,
  fileFilters,
  selectionFilters,
  fileFilter,
  hasLabelFilters,
  onChooseFileFilter,
  galleryTitle,
  hasCustomerComparison,
  comparisonCounts,
  comparisonFilter,
  onComparisonFilterChange,
  hasLinkedQuality,
  jpgCount,
  qualityCounts,
  qualityFilter,
  onQualityFilterChange,
  qualityJob,
  qualityMessage,
  onStartQuality,
  onControlQuality,
  folders,
  folderImageCounts,
  hasActiveFolder,
  onOpenFolder,
  selectedCount,
  labeledCount,
  excludedCount,
  thumbnailSize,
  thumbnailMin,
  thumbnailMax,
  thumbnailStep,
  onThumbnailSizeChange,
}: {
  panelRef: RefObject<HTMLElement | null>;
  compactOpen: boolean;
  onCloseCompact: () => void;
  rootName: string;
  rootCount: number;
  canOpenRoot: boolean;
  onOpenRoot: () => void;
  includeNestedJpgs: boolean;
  canToggleNestedJpgs: boolean;
  nestedJpgCount: number;
  onNestedJpgsChange: (checked: boolean) => void;
  fileFilters: FilterItem[];
  selectionFilters: FilterItem[];
  fileFilter: BridgeWorkspaceFileFilter;
  hasLabelFilters: boolean;
  onChooseFileFilter: (filter: BridgeWorkspaceFileFilter) => void;
  galleryTitle?: string;
  hasCustomerComparison: boolean;
  comparisonCounts: Record<CustomerSelectionComparisonFilter, number>;
  comparisonFilter: CustomerSelectionComparisonFilter;
  onComparisonFilterChange: (filter: CustomerSelectionComparisonFilter) => void;
  hasLinkedQuality: boolean;
  jpgCount: number;
  qualityCounts: Record<string, number>;
  qualityFilter: BridgeWorkspaceQualityFilter;
  onQualityFilterChange: (filter: BridgeWorkspaceQualityFilter) => void;
  qualityJob: Record<string, unknown> | null;
  qualityMessage: string;
  onStartQuality: () => void;
  onControlQuality: (action: "pause" | "resume" | "retry") => void;
  folders: BridgeFolderScan["folders"];
  folderImageCounts: Record<string, number>;
  hasActiveFolder: boolean;
  onOpenFolder: (folder: FileSystemDirectoryHandle) => void;
  selectedCount: number;
  labeledCount: number;
  excludedCount: number;
  thumbnailSize: number;
  thumbnailMin: number;
  thumbnailMax: number;
  thumbnailStep: number;
  onThumbnailSizeChange: (size: number) => void;
}) {
  const qualityFilters: Array<[BridgeWorkspaceQualityFilter, string]> = [
    ["all", "전체 사진"],
    ["eyes_closed", "눈감음 의심"],
    ["face_too_dark", "얼굴 어두움 의심"],
    ["motion_blur", "흔들림 의심"],
    ["needs_review", "확인 필요"],
    ["normal", "정상"],
  ];
  const comparisonFilters: Array<[CustomerSelectionComparisonFilter, string]> = [
    ["all", "전체"],
    ["admin", "내 셀렉"],
    ["customer", "고객 셀렉"],
    ["common", "공통 셀렉"],
    ["admin-only", "나만 선택"],
    ["customer-only", "고객만 선택"],
  ];

  return (
    <aside ref={panelRef} id="olivia-bridge-folder-panel" className={styles.folderPanel} data-compact-open={compactOpen ? "true" : "false"} tabIndex={-1} aria-label="폴더와 파일 필터">
      <div className={styles.panelTitle}><span>폴더와 필터</span><button type="button" className={styles.compactFilterClose} onClick={onCloseCompact} aria-label="필터 닫기"><X size={15} /></button></div>
      <div className={styles.folderPanelScroll}>
        <button type="button" className={styles.rootFolder} onClick={onOpenRoot} disabled={!canOpenRoot}><FolderOpen size={17} /><span>{rootName}</span><b>{rootCount}</b></button>
        <label className={styles.nestedJpgToggle}>
          <input type="checkbox" checked={includeNestedJpgs} disabled={!canToggleNestedJpgs} onChange={(event) => onNestedJpgsChange(event.currentTarget.checked)} />
          <span>하위 폴더 JPG 포함</span>
          {nestedJpgCount ? <b>{nestedJpgCount.toLocaleString("ko-KR")}</b> : null}
        </label>
        <div className={styles.filterList}>
          <small>파일 필터</small>
          {fileFilters.map((filter) => <button key={filter.key} type="button" data-zero={filter.count === 0 ? "true" : undefined} className={!hasLabelFilters && fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => onChooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count.toLocaleString("ko-KR")}</b></button>)}
          <small>셀렉 보기</small>
          {selectionFilters.map((filter) => <button key={filter.key} type="button" data-zero={filter.count === 0 ? "true" : undefined} className={!hasLabelFilters && fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => onChooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count.toLocaleString("ko-KR")}</b></button>)}
          <small>고객 셀렉 비교{galleryTitle ? ` · ${galleryTitle}` : ""}</small>
          {comparisonFilters.map(([key, label]) => <button key={key} type="button" disabled={key !== "all" && !hasCustomerComparison} data-zero={comparisonCounts[key] === 0 ? "true" : undefined} className={comparisonFilter === key ? styles.activeFilter : ""} onClick={() => onComparisonFilterChange(key)}><span>{label}</span><b>{comparisonCounts[key].toLocaleString("ko-KR")}</b></button>)}
          <small>AI 품질 검사</small>
          {qualityFilters.map(([key, label]) => <button key={key} type="button" disabled={key !== "all" && !hasLinkedQuality} data-zero={key !== "all" && qualityCounts[key] === 0 ? "true" : undefined} className={qualityFilter === key ? styles.activeFilter : ""} onClick={() => onQualityFilterChange(key)}><span>{label}</span><b>{key === "all" ? jpgCount.toLocaleString("ko-KR") : qualityCounts[key].toLocaleString("ko-KR")}</b></button>)}
          {hasLinkedQuality ? <button type="button" disabled={["queued", "running", "paused"].includes(String(qualityJob?.status ?? ""))} onClick={onStartQuality}><span><Sparkles size={12} />{["queued", "running"].includes(String(qualityJob?.status ?? "")) ? "검사 진행 중" : qualityJob?.status === "paused" ? "검사 일시정지" : "AI 검사 시작"}</span><b>{qualityJob ? `${Number(qualityJob.completed_count ?? 0)}/${Number(qualityJob.total_count ?? 0)}` : ""}</b></button> : null}
          <PhotoQualityJobProgressView job={qualityJob} />
          {qualityJob && ["queued", "running"].includes(String(qualityJob.status ?? "")) ? <button type="button" onClick={() => onControlQuality("pause")}><span>검사 일시정지</span></button> : null}
          {qualityJob?.status === "paused" ? <button type="button" onClick={() => onControlQuality("resume")}><span>검사 계속</span></button> : null}
          {qualityJob && ["failed", "partial_failed"].includes(String(qualityJob.status ?? "")) ? <button type="button" onClick={() => onControlQuality("retry")}><span>실패 사진 재시도</span></button> : null}
          {qualityMessage ? <p>{qualityMessage}</p> : null}
        </div>
        <div className={styles.folderList}>
          {folders.length ? <small>하위 폴더</small> : null}
          {folders.map((folder) => <button key={folder.name} type="button" onClick={() => onOpenFolder(folder)}><Folder size={15} /><span>{folder.name}</span><b>{(folderImageCounts[folder.name.normalize("NFC")] ?? 0).toLocaleString("ko-KR")}</b><ChevronRight size={12} /></button>)}
          {hasActiveFolder && !folders.length ? <p>하위 폴더가 없습니다.</p> : null}
        </div>
      </div>
      <div className={styles.folderSummary}><span>선택 <b>{selectedCount}</b></span><span>레이블 <b>{labeledCount}</b></span><span>제외 <b>{excludedCount}</b></span></div>
      <label className={styles.folderThumbnailGauge} title="썸네일 크기">
        <span>썸네일 크기</span>
        <input type="range" min={thumbnailMin} max={thumbnailMax} step={thumbnailStep} value={thumbnailSize} onChange={(event) => onThumbnailSizeChange(Number(event.currentTarget.value))} aria-label="썸네일 크기" />
        <small>⌘ + / - 로도 조절</small>
      </label>
    </aside>
  );
});
