"use client";

import { memo, type ReactNode, type RefObject } from "react";
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FolderOpen,
  Images,
  MessageCircle,
  PanelLeft,
  Sparkles,
} from "lucide-react";
import type { CustomerBridgeGallery } from "@/lib/select-gallery/customerBridgeTypes";
import type { CustomerBridgePhotoFilter as PhotoFilter } from "@/lib/select-gallery/customerBridgeView";
import type { CustomerBridgeLocation } from "./useCustomerBridgeLocation";
import styles from "./CustomerBridgeSelect.module.css";

export const CustomerBridgeHeader = memo(function CustomerBridgeHeader({
  gallery,
  reviewer,
  totalImageCount,
  saveStatusMessage,
  selectionStatus,
  compactFoldersOpen,
  onOpenCompactFolders,
  location,
  onGoToParentFolder,
  onOpenLocation,
  breadcrumbs,
  filter,
  onFilterChange,
  locationTotalCount,
  selectedInFolder,
  unselectedInLocation,
  guideButtonRef,
  guideOpen,
  onOpenGuide,
  jpgDownloadEnabled,
  rawDownloadEnabled,
  downloadDisabled,
  downloadBusy,
  downloadState,
  onDownload,
  messagesEnabled,
  unreadMessages,
  onOpenMessages,
  qualityEnabled,
  canManageQuality,
  qualityStatus,
  onStartQuality,
  adminToolbarAction,
  selectedImageCount,
  onOpenReview,
  focusedImageId,
  onOpenFullscreen,
  adminToolbarStatus,
}: {
  gallery: CustomerBridgeGallery;
  reviewer?: { display_name: string; role_label?: string | null } | null;
  totalImageCount: number;
  saveStatusMessage: string;
  selectionStatus: string;
  compactFoldersOpen: boolean;
  onOpenCompactFolders: () => void;
  location: CustomerBridgeLocation;
  onGoToParentFolder: () => void;
  onOpenLocation: (location: CustomerBridgeLocation) => void;
  breadcrumbs: readonly { path: string; name: string }[];
  filter: PhotoFilter;
  onFilterChange: (filter: PhotoFilter) => void;
  locationTotalCount: number;
  selectedInFolder: number;
  unselectedInLocation: number;
  guideButtonRef: RefObject<HTMLButtonElement | null>;
  guideOpen: boolean;
  onOpenGuide: () => void;
  jpgDownloadEnabled: boolean;
  rawDownloadEnabled: boolean;
  downloadDisabled: boolean;
  downloadBusy: boolean;
  downloadState: string;
  onDownload: (kind: "jpg" | "raw") => void;
  messagesEnabled: boolean;
  unreadMessages: number;
  onOpenMessages: () => void;
  qualityEnabled: boolean;
  canManageQuality: boolean;
  qualityStatus: string;
  onStartQuality: () => void;
  adminToolbarAction?: ReactNode;
  selectedImageCount: number;
  onOpenReview: () => void;
  focusedImageId: string | null;
  onOpenFullscreen: () => void;
  adminToolbarStatus?: ReactNode;
}) {
  const qualityRunning = ["queued", "running"].includes(qualityStatus);
  const qualityBusy = qualityRunning || qualityStatus === "paused";
  return <>
    <header className={styles.bridgeBar}>
      <div><strong>Olivia Bridge</strong><span>고객 사진 셀렉</span></div>
      <div className={styles.projectTitle}><strong>{gallery.shooting_name ?? gallery.title}</strong><span>{[reviewer ? `${reviewer.display_name}${reviewer.role_label ? ` · ${reviewer.role_label}` : ""}` : gallery.hospital_name, `${totalImageCount.toLocaleString("ko-KR")}장`].filter(Boolean).join(" · ")}</span></div>
      <div className={styles.saveState} data-state={selectionStatus}>{saveStatusMessage}</div>
    </header>

    <div className={styles.pathBar}>
      <button type="button" className={styles.mobileFolderButton} aria-expanded={compactFoldersOpen} onClick={onOpenCompactFolders}><PanelLeft size={15} /> 폴더</button>
      <button type="button" className={styles.backButton} disabled={location.kind === "root"} onClick={onGoToParentFolder} aria-label="상위 폴더로"><ChevronLeft size={16} /></button>
      <nav className={styles.breadcrumbs} aria-label="현재 폴더">
        <FolderOpen size={15} />
        <button type="button" aria-current={location.kind === "root" ? "page" : undefined} onClick={() => onOpenLocation({ kind: "root" })}>{gallery.title}</button>
        {location.kind === "all" ? <><ChevronRight size={12} /><strong>전체 사진</strong></> : null}
        {location.kind === "folder" && !location.path ? <><ChevronRight size={12} /><strong>루트 사진</strong></> : null}
        {location.kind === "folder" ? breadcrumbs.map((crumb, index) => <span key={crumb.path}><ChevronRight size={12} /><button type="button" aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} onClick={() => onOpenLocation({ kind: "folder", path: crumb.path })}>{crumb.name}</button></span>) : null}
      </nav>
      {location.kind !== "root" ? <div className={styles.topFilters} aria-label="고객 셀렉 필터">
        {(["all", "selected", "unselected"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilterChange(value)}>{value === "all" ? `전체 ${locationTotalCount}` : value === "selected" ? `고객 셀렉 ${selectedInFolder}` : `미선택 ${unselectedInLocation}`}</button>)}
      </div> : null}
      <button ref={guideButtonRef} type="button" className={`${styles.headerAction} ${styles.guideAction}`} title="사진 선택 이용 가이드" aria-haspopup="dialog" aria-expanded={guideOpen} onClick={onOpenGuide}><BookOpenText size={14} /> 이용 가이드</button>
      {jpgDownloadEnabled ? <button type="button" className={styles.headerAction} disabled={downloadDisabled} title={downloadState || "고객 셀렉 원본 JPG를 ZIP으로 준비합니다."} onClick={() => onDownload("jpg")}><Download size={14} /> {downloadBusy ? "준비 중" : "JPG 원본"}</button> : null}
      {rawDownloadEnabled ? <button type="button" className={styles.headerAction} disabled={downloadDisabled} title={downloadState || "고객 셀렉 RAW를 ZIP으로 준비합니다."} onClick={() => onDownload("raw")}><Download size={14} /> {downloadBusy ? "준비 중" : "RAW 원본"}</button> : null}
      {messagesEnabled ? <button type="button" className={`${styles.headerAction} ${styles.mobileChatAction}`} onClick={onOpenMessages}><MessageCircle size={14} /> 대화{unreadMessages ? ` ${unreadMessages}` : ""}</button> : null}
      {qualityEnabled && canManageQuality ? <button type="button" className={styles.headerAction} disabled={qualityBusy} onClick={onStartQuality}><Sparkles size={14} /> {qualityRunning ? "AI 검사 중" : qualityStatus === "paused" ? "AI 검사 정지" : "AI 검사 시작"}</button> : null}
      {adminToolbarAction}
      <button type="button" className={styles.headerAction} disabled={!selectedImageCount} onClick={onOpenReview}><Images size={14} /> 리뷰</button>
      <button type="button" className={styles.headerAction} disabled={!focusedImageId} onClick={onOpenFullscreen}><Expand size={14} /> 전체화면</button>
    </div>

    {adminToolbarStatus ? <div className={styles.adminToolbarStatus}>{adminToolbarStatus}</div> : null}
  </>;
});
