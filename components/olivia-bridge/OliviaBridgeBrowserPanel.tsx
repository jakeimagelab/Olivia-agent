"use client";

import { memo, type MouseEventHandler, type PointerEventHandler, type RefObject } from "react";
import { CircleAlert, FolderOpen, Images, LayoutGrid, LoaderCircle, Maximize2, Minus, Plus, Search, X } from "lucide-react";

import { BridgePhotoCard, PlainFileCard } from "@/components/olivia-bridge/OliviaBridgeMedia";
import type { BridgeFolderScan, BridgeJpgFile, BridgeJpgSortMode } from "@/lib/photo-bridge/bridgeFiles";
import type { BridgeColorLabels, BridgeLabelFilterCommand, BridgeLabelFilters } from "@/lib/photo-bridge/labels";
import { normalizePhotoToolFileKey, type BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";
import type { AdobeBridgeMark } from "@/lib/selectMatch/bridgeRating";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import styles from "./OliviaBridgeWorkspace.module.css";

export type OliviaBridgeCaptureMetadataState = {
  status: "idle" | "loading" | "ready" | "error";
  completed: number;
  total: number;
  fallbackCount: number;
};

type OliviaBridgeBrowserPanelProps = {
  activeFolderName?: string;
  filenameSearch: string;
  filenameSearchActive: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  visibleJpgs: readonly BridgeJpgFile[];
  centerFileCount: number;
  scan: BridgeFolderScan;
  scanStatus: "idle" | "restoring" | "loading" | "ready" | "error";
  restoreTrailAvailable: boolean;
  restoreMessage: string;
  activeRatingFilterName: string | null;
  activeColorFilterName: string | null;
  labelFilters: BridgeLabelFilters;
  jpgSortMode: BridgeJpgSortMode;
  captureMetadataState: OliviaBridgeCaptureMetadataState;
  thumbnailSize: number;
  selectedIds: ReadonlySet<string>;
  customerSelectedIds: ReadonlySet<string>;
  customerRatings: Readonly<Record<string, number>>;
  focusedId: string | null;
  focusedPlainId: string | null;
  selectionSource: BridgeSelectionSource;
  adobeSelectedIds: ReadonlySet<string>;
  manualSelectedIds: ReadonlySet<string>;
  excludedIds: ReadonlySet<string>;
  effectiveRatings: Readonly<Record<string, number>>;
  effectiveColorLabels: BridgeColorLabels;
  qualityByBridgeId: Readonly<Record<string, PublicPhotoQualityResult>>;
  rawMarkByFileKey: ReadonlyMap<string, AdobeBridgeMark>;
  rawAdobeMarks: Readonly<Record<string, AdobeBridgeMark>>;
  showRaws: boolean;
  showSidecars: boolean;
  fileAreaRef: RefObject<HTMLDivElement | null>;
  marqueeRef: RefObject<HTMLDivElement | null>;
  onApplyLabelFilterCommand: (command: BridgeLabelFilterCommand) => void;
  onSortModeChange: (mode: BridgeJpgSortMode) => void;
  onOpenPreview: () => void;
  onFilenameSearchChange: (value: string) => void;
  onClearFilenameSearch: () => void;
  onResizeThumbnails: (direction: -1 | 1) => void;
  onRestoreLastFolder: () => void;
  onFileAreaClickCapture: MouseEventHandler<HTMLDivElement>;
  onFileAreaClick: MouseEventHandler<HTMLDivElement>;
  onFileAreaContextMenu: MouseEventHandler<HTMLDivElement>;
  onFileAreaPointerDown: PointerEventHandler<HTMLDivElement>;
  onFileAreaPointerMove: PointerEventHandler<HTMLDivElement>;
  onFileAreaPointerUp: PointerEventHandler<HTMLDivElement>;
  onFileAreaPointerCancel: PointerEventHandler<HTMLDivElement>;
  onFocusPlainFile: (fileId: string) => void;
};

export const OliviaBridgeBrowserPanel = memo(function OliviaBridgeBrowserPanel({
  activeFolderName,
  filenameSearch,
  filenameSearchActive,
  searchInputRef,
  visibleJpgs,
  centerFileCount,
  scan,
  scanStatus,
  restoreTrailAvailable,
  restoreMessage,
  activeRatingFilterName,
  activeColorFilterName,
  labelFilters,
  jpgSortMode,
  captureMetadataState,
  thumbnailSize,
  selectedIds,
  customerSelectedIds,
  customerRatings,
  focusedId,
  focusedPlainId,
  selectionSource,
  adobeSelectedIds,
  manualSelectedIds,
  excludedIds,
  effectiveRatings,
  effectiveColorLabels,
  qualityByBridgeId,
  rawMarkByFileKey,
  rawAdobeMarks,
  showRaws,
  showSidecars,
  fileAreaRef,
  marqueeRef,
  onApplyLabelFilterCommand,
  onSortModeChange,
  onOpenPreview,
  onFilenameSearchChange,
  onClearFilenameSearch,
  onResizeThumbnails,
  onRestoreLastFolder,
  onFileAreaClickCapture,
  onFileAreaClick,
  onFileAreaContextMenu,
  onFileAreaPointerDown,
  onFileAreaPointerMove,
  onFileAreaPointerUp,
  onFileAreaPointerCancel,
  onFocusPlainFile,
}: OliviaBridgeBrowserPanelProps) {
  return <section id="olivia-bridge-file-panel" className={styles.browserPanel} aria-label="현재 폴더 파일">
    <div className={styles.browserHeader}>
      <div className={styles.browserTitle}>
        <strong>{activeFolderName ?? "폴더 내용"}</strong>
        <span>{filenameSearchActive ? `검색 ${visibleJpgs.length.toLocaleString("ko-KR")}장` : `${centerFileCount.toLocaleString("ko-KR")}개의 파일${scan.nestedJpgCount ? ` · 하위 JPG ${scan.nestedJpgCount.toLocaleString("ko-KR")}장` : ""}`}</span>
        {activeRatingFilterName ? <button type="button" className={styles.filterChip} onClick={() => onApplyLabelFilterCommand({ kind: "rating", rating: labelFilters.rating! })}>{activeRatingFilterName}<X size={11} /></button> : null}
        {activeColorFilterName ? <button type="button" className={styles.filterChip} onClick={() => onApplyLabelFilterCommand({ kind: "color", label: labelFilters.color! })}>{activeColorFilterName}<X size={11} /></button> : null}
        {jpgSortMode === "capture" ? <span className={styles.captureMetadataStatus} role="status">{captureMetadataState.status === "loading" ? `촬영시각 ${captureMetadataState.completed.toLocaleString("ko-KR")}/${captureMetadataState.total.toLocaleString("ko-KR")}` : captureMetadataState.status === "error" ? "촬영시각 읽기 실패" : captureMetadataState.status === "ready" && captureMetadataState.fallbackCount ? `EXIF 없음 ${captureMetadataState.fallbackCount.toLocaleString("ko-KR")}장 · 수정시각 사용` : "EXIF 촬영순"}</span> : null}
      </div>
      <div className={styles.browserActions}>
        <div className={styles.photoSortControl} aria-label="사진 표시 순서">
          <span>정렬</span>
          <button type="button" data-active={jpgSortMode === "filename"} onClick={() => onSortModeChange("filename")}>파일명</button>
          <button type="button" data-active={jpgSortMode === "capture"} onClick={() => onSortModeChange("capture")}>촬영순</button>
        </div>
        <button type="button" className={styles.compactPreviewButton} onClick={onOpenPreview} aria-label="미리보기 열기"><Maximize2 size={15} /> 미리보기</button>
        <label className={styles.filenameSearch}>
          <Search size={13} aria-hidden="true" />
          <input ref={searchInputRef} type="search" value={filenameSearch} onChange={(event) => onFilenameSearchChange(event.currentTarget.value)} placeholder="파일명 검색" aria-label="파일명 검색" />
          {filenameSearch ? <button type="button" onClick={onClearFilenameSearch} aria-label="검색 지우기"><X size={12} /></button> : <kbd>⌘F</kbd>}
        </label>
        <div className={styles.thumbnailControls}><button type="button" onClick={() => onResizeThumbnails(-1)} aria-label="썸네일 작게"><Minus size={15} /></button><LayoutGrid size={16} aria-hidden="true" /><button type="button" onClick={() => onResizeThumbnails(1)} aria-label="썸네일 크게"><Plus size={15} /></button></div>
      </div>
    </div>

    {scanStatus === "idle" ? <div className={styles.emptyState}><FolderOpen size={34} /><strong>{restoreTrailAvailable ? "지난 작업 폴더를 다시 열까요?" : "촬영 폴더를 선택해 주세요"}</strong><p>{restoreMessage || "JPG는 썸네일로, RAW와 사이드카는 파일 정보로 표시합니다."}</p>{restoreTrailAvailable ? <div className={styles.restoreActions}><button type="button" onClick={onRestoreLastFolder}>지난 폴더 다시 열기</button></div> : null}</div> : null}
    {scanStatus === "restoring" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>지난 작업 폴더를 확인하는 중입니다</strong><p>권한이 유지되어 있으면 마지막 폴더를 그대로 엽니다.</p></div> : null}
    {scanStatus === "loading" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>폴더를 읽는 중입니다</strong><p>화면에 필요한 JPG부터 썸네일을 만듭니다.</p></div> : null}
    {scanStatus === "error" ? <div className={styles.emptyState}><CircleAlert size={30} /><strong>폴더를 읽지 못했습니다</strong><p>폴더가 옮겨졌거나 이름이 바뀌었을 수 있습니다. 다시 골라 주세요.</p></div> : null}
    {scanStatus === "ready" ? (
      <div
        ref={fileAreaRef}
        className={styles.fileArea}
        onClickCapture={onFileAreaClickCapture}
        onClick={onFileAreaClick}
        onContextMenu={onFileAreaContextMenu}
        onPointerDown={onFileAreaPointerDown}
        onPointerMove={onFileAreaPointerMove}
        onPointerUp={onFileAreaPointerUp}
        onPointerCancel={onFileAreaPointerCancel}
      >
        <div ref={marqueeRef} className={styles.selectionMarquee} aria-hidden="true" />
        {visibleJpgs.length ? <div data-bridge-thumbnail-grid className={styles.thumbnailGrid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))` }}>
          {visibleJpgs.map((photo) => {
            const selected = selectedIds.has(photo.id);
            return <BridgePhotoCard
              key={photo.id}
              photo={photo}
              selected={selected}
              customerSelected={customerSelectedIds.has(photo.id)}
              customerRating={customerRatings[photo.id] ?? 0}
              focused={focusedId === photo.id}
              adobeSelected={selectionSource !== "olivia" && selected && adobeSelectedIds.has(photo.id)}
              manualSelected={selectionSource !== "adobe" && selected && manualSelectedIds.has(photo.id)}
              excluded={excludedIds.has(photo.id)}
              rating={effectiveRatings[photo.id] ?? 0}
              colorLabel={effectiveColorLabels[photo.id]}
              quality={qualityByBridgeId[photo.id]}
              rawMark={rawMarkByFileKey.get(normalizePhotoToolFileKey(photo.name))}
            />;
          })}
        </div> : null}
        {showRaws && scan.raws.length ? <section className={styles.plainFileSection}><header><strong>RAW</strong><span>미리보기 없이 형식과 파일명만 표시</span></header><div>{scan.raws.map((file) => <PlainFileCard key={file.id} file={file} mark={rawAdobeMarks[file.id]} active={focusedPlainId === file.id} onClick={() => onFocusPlainFile(file.id)} />)}</div></section> : null}
        {showSidecars && scan.sidecars.length ? <section className={styles.plainFileSection}><header><strong>사이드카</strong><span>원본과 함께 유지되는 설정 파일</span></header><div>{scan.sidecars.map((file) => <PlainFileCard key={file.id} file={file} active={focusedPlainId === file.id} onClick={() => onFocusPlainFile(file.id)} />)}</div></section> : null}
        {!visibleJpgs.length && (!showRaws || !scan.raws.length) && (!showSidecars || !scan.sidecars.length) ? <div className={styles.noPhotos}><Images size={27} /><span>이 조건에 맞는 파일이 없습니다.</span></div> : null}
      </div>
    ) : null}
  </section>;
});
