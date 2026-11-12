"use client";

import { memo, type CSSProperties } from "react";
import { Folder, FolderOpen, Images, X } from "lucide-react";

import PhotoQualityJobProgressView from "@/components/photo-quality/PhotoQualityJobProgress";
import type { CustomerBridgeFolderTreeItem } from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgePhotoFilter } from "@/lib/select-gallery/customerBridgeView";
import type { CustomerBridgeLocation } from "./useCustomerBridgeLocation";
import type { CustomerBridgeQualityAction } from "./useCustomerBridgeQuality";
import styles from "./CustomerBridgeSelect.module.css";

type CustomerBridgeFolderPanelProps = {
  compactOpen: boolean;
  location: CustomerBridgeLocation;
  folderTree: readonly CustomerBridgeFolderTreeItem[];
  rootFolderCount: number;
  totalImageCount: number;
  hasRootPhotos: boolean;
  rootPhotoCount: number;
  filter: CustomerBridgePhotoFilter;
  locationTotalCount: number;
  selectedInFolder: number;
  unselectedInLocation: number;
  qualityEnabled: boolean;
  qualityCounts: Record<"eyes_closed" | "face_too_dark" | "motion_blur" | "quality_review" | "quality_normal", number>;
  qualityState: string;
  qualityJob: Record<string, unknown> | null;
  canManageQuality: boolean;
  activeImageCount: number;
  selectedImageCount: number;
  onCloseCompact: () => void;
  onOpenLocation: (location: CustomerBridgeLocation) => void;
  onFilterChange: (filter: CustomerBridgePhotoFilter) => void;
  onControlQuality: (action: CustomerBridgeQualityAction) => void;
};

export const CustomerBridgeFolderPanel = memo(function CustomerBridgeFolderPanel({
  compactOpen,
  location,
  folderTree,
  rootFolderCount,
  totalImageCount,
  hasRootPhotos,
  rootPhotoCount,
  filter,
  locationTotalCount,
  selectedInFolder,
  unselectedInLocation,
  qualityEnabled,
  qualityCounts,
  qualityState,
  qualityJob,
  canManageQuality,
  activeImageCount,
  selectedImageCount,
  onCloseCompact,
  onOpenLocation,
  onFilterChange,
  onControlQuality,
}: CustomerBridgeFolderPanelProps) {
  const qualityStatus = String(qualityJob?.status ?? "");

  return <aside className={styles.folderPanel} data-compact-open={compactOpen || undefined}>
    <div className={styles.panelTitle}><span>폴더</span><button type="button" onClick={onCloseCompact} aria-label="폴더 닫기"><X size={15} /></button></div>
    <div className={styles.folderPanelScroll}>
      <button type="button" className={location.kind === "root" ? styles.rootFolderActive : styles.rootFolder} onClick={() => onOpenLocation({ kind: "root" })}><FolderOpen size={17} /><span>프로젝트</span><b>{rootFolderCount}</b></button>
      <button type="button" className={`${styles.rootFolder} ${location.kind === "all" ? styles.rootFolderActive : ""}`} onClick={() => onOpenLocation({ kind: "all" })}><Images size={17} /><span>전체 사진</span><b>{totalImageCount}</b></button>
      <div className={styles.folderList}>
        {hasRootPhotos ? <button type="button" className={location.kind === "folder" && location.path === "" ? styles.activeFolder : ""} onClick={() => onOpenLocation({ kind: "folder", path: "" })}><FolderOpen size={15} /><span>루트 사진</span><b>{rootPhotoCount}</b></button> : null}
        {folderTree.map((folder) => <button key={folder.path} type="button" className={location.kind === "folder" && location.path === folder.path ? styles.activeFolder : ""} style={{ "--folder-depth": folder.depth } as CSSProperties} onClick={() => onOpenLocation({ kind: "folder", path: folder.path })}><Folder size={15} /><span>{folder.name}</span><b>{folder.totalCount}</b></button>)}
      </div>
      <div className={styles.filterList}><small>고객 셀렉</small>{(["all", "selected", "unselected"] as const).map((value) => <button key={value} type="button" className={filter === value ? styles.activeFilter : ""} disabled={location.kind === "root"} onClick={() => onFilterChange(value)}><span>{value === "all" ? "전체 사진" : value === "selected" ? "선택한 사진" : "선택하지 않은 사진"}</span><b>{location.kind === "root" ? "–" : value === "all" ? locationTotalCount : value === "selected" ? selectedInFolder : unselectedInLocation}</b></button>)}</div>
      {qualityEnabled ? <div className={styles.filterList}><small>AI 품질 검사</small>{([
        ["eyes_closed", "눈감음 의심"],
        ["face_too_dark", "얼굴 어두움 의심"],
        ["motion_blur", "흔들림 의심"],
        ["quality_review", "확인 필요"],
        ["quality_normal", "정상"],
      ] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? styles.activeFilter : ""} disabled={location.kind === "root"} onClick={() => onFilterChange(value)}><span>{label}</span><b>{location.kind === "root" ? "–" : qualityCounts[value]}</b></button>)}{qualityState ? <p className={styles.qualityState}>{qualityState}</p> : null}<PhotoQualityJobProgressView job={qualityJob} tone="light" />{canManageQuality && ["queued", "running"].includes(qualityStatus) ? <button type="button" onClick={() => onControlQuality("pause")}><span>검사 일시정지</span></button> : null}{canManageQuality && qualityStatus === "paused" ? <button type="button" onClick={() => onControlQuality("resume")}><span>검사 계속</span></button> : null}{canManageQuality && ["failed", "partial_failed"].includes(qualityStatus) ? <button type="button" onClick={() => onControlQuality("retry")}><span>실패 사진 재시도</span></button> : null}</div> : null}
    </div>
    <div className={styles.folderSummary}><span>전체<b>{totalImageCount}</b></span><span>작업 대상<b>{activeImageCount}</b></span><span>고객 셀렉<b>{selectedImageCount}</b></span></div>
  </aside>;
});
