"use client";

import { memo, type CSSProperties, type PointerEventHandler, type RefObject } from "react";
import { Folder, LayoutGrid, Minus, Plus, Search, X } from "lucide-react";

import type { BridgeLabelFilterCommand, BridgeLabelFilters } from "@/lib/photo-bridge/labels";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import type {
  CustomerBridgeColorLabel,
  CustomerBridgeFolder,
  CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import { CustomerBridgeThumbnailCard, type CustomerBridgeSelectionModifiers } from "./CustomerBridgeMedia";
import type { CustomerBridgeLocation } from "./useCustomerBridgeLocation";
import styles from "./CustomerBridgeSelect.module.css";

type CustomerBridgeBrowserPanelProps = {
  location: CustomerBridgeLocation;
  locationLabel: string;
  locationCount: number;
  browserPhotoCount: number;
  searchActive: boolean;
  filenameSearch: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  activeRatingFilterName: string | null;
  activeColorFilterName: string | null;
  labelFilters: BridgeLabelFilters;
  thumbSize: number;
  thumbMin: number;
  thumbMax: number;
  gridRef: RefObject<HTMLDivElement | null>;
  thumbnailGridRef: RefObject<HTMLDivElement | null>;
  childFolders: readonly CustomerBridgeFolder[];
  hasRootPhotos: boolean;
  rootPhotoCount: number;
  virtualTotalHeight: number;
  virtualTopPadding: number;
  virtualBottomPadding: number;
  renderedImages: readonly CustomerBridgeImage[];
  visibleImageCount: number;
  activeImageIds: ReadonlySet<string>;
  focusedImageId: string | null;
  customerRatings: Readonly<Record<string, CustomerBridgeRating>>;
  customerColorLabels: Readonly<Record<string, CustomerBridgeColorLabel>>;
  pendingImageIds: ReadonlySet<string>;
  qualityResults: Readonly<Record<string, PublicPhotoQualityResult>>;
  mobile: boolean;
  marquee: CSSProperties | null;
  onApplyLabelFilterCommand: (command: BridgeLabelFilterCommand) => void;
  onFilenameSearchChange: (value: string) => void;
  onClearFilenameSearch: () => void;
  onThumbSizeChange: (size: number) => void;
  onOpenLocation: (location: CustomerBridgeLocation) => void;
  onPhotoClick: (image: CustomerBridgeImage, modifiers: CustomerBridgeSelectionModifiers) => void;
  onImageError: (imageId: string) => void;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
};

export const CustomerBridgeBrowserPanel = memo(function CustomerBridgeBrowserPanel({
  location,
  locationLabel,
  locationCount,
  browserPhotoCount,
  searchActive,
  filenameSearch,
  searchInputRef,
  activeRatingFilterName,
  activeColorFilterName,
  labelFilters,
  thumbSize,
  thumbMin,
  thumbMax,
  gridRef,
  thumbnailGridRef,
  childFolders,
  hasRootPhotos,
  rootPhotoCount,
  virtualTotalHeight,
  virtualTopPadding,
  virtualBottomPadding,
  renderedImages,
  visibleImageCount,
  activeImageIds,
  focusedImageId,
  customerRatings,
  customerColorLabels,
  pendingImageIds,
  qualityResults,
  mobile,
  marquee,
  onApplyLabelFilterCommand,
  onFilenameSearchChange,
  onClearFilenameSearch,
  onThumbSizeChange,
  onOpenLocation,
  onPhotoClick,
  onImageError,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: CustomerBridgeBrowserPanelProps) {
  return <section className={styles.browserPanel}>
    <header className={styles.browserHeader}>
      <div className={styles.browserTitle}>
        <strong>{locationLabel}</strong>
        <span>{location.kind === "root" ? `${locationCount}개 폴더` : searchActive ? `검색 ${browserPhotoCount.toLocaleString("ko-KR")}장` : `${browserPhotoCount.toLocaleString("ko-KR")}장`}</span>
        {activeRatingFilterName ? <button type="button" className={styles.filterChip} onClick={() => onApplyLabelFilterCommand({ kind: "rating", rating: labelFilters.rating! })}>{activeRatingFilterName}<X size={11} /></button> : null}
        {activeColorFilterName ? <button type="button" className={styles.filterChip} onClick={() => onApplyLabelFilterCommand({ kind: "color", label: labelFilters.color! })}>{activeColorFilterName}<X size={11} /></button> : null}
      </div>
      {location.kind !== "root" ? <div className={styles.browserActions}>
        <label className={styles.filenameSearch}>
          <Search size={13} aria-hidden="true" />
          <input ref={searchInputRef} type="search" value={filenameSearch} onChange={(event) => onFilenameSearchChange(event.currentTarget.value)} placeholder="파일명 검색" aria-label="파일명 검색" />
          {filenameSearch ? <button type="button" onClick={onClearFilenameSearch} aria-label="검색 지우기"><X size={12} /></button> : <kbd>⌘F</kbd>}
        </label>
        <div className={styles.thumbnailControls}><button type="button" onClick={() => onThumbSizeChange(Math.max(thumbMin, thumbSize - 12))} aria-label="썸네일 작게"><Minus size={15} /></button><LayoutGrid size={16} /><button type="button" onClick={() => onThumbSizeChange(Math.min(thumbMax, thumbSize + 12))} aria-label="썸네일 크게"><Plus size={15} /></button></div>
      </div> : null}
    </header>
    <div ref={gridRef} className={styles.fileArea} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {childFolders.length || (location.kind === "root" && hasRootPhotos) ? <div className={styles.folderCardGrid}>
        {location.kind === "root" && hasRootPhotos ? <button type="button" className={styles.folderCard} onClick={() => onOpenLocation({ kind: "folder", path: "" })}>
          <span className={styles.folderCardMedia}><Folder size={24} /></span><span><strong>루트 사진</strong><small>{rootPhotoCount.toLocaleString("ko-KR")}장</small></span>
        </button> : null}
        {childFolders.map((folder) => <button type="button" key={folder.path} className={styles.folderCard} onClick={() => onOpenLocation({ kind: "folder", path: folder.path })}>
          <span className={styles.folderCardMedia}><Folder size={24} /></span><span><strong>{folder.name}</strong><small>{folder.totalCount.toLocaleString("ko-KR")}장</small></span>
        </button>)}
      </div> : null}
      <div ref={thumbnailGridRef} className={styles.thumbnailGrid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`, minHeight: virtualTotalHeight, paddingTop: virtualTopPadding, paddingBottom: virtualBottomPadding }}>
        {renderedImages.map((image) => <CustomerBridgeThumbnailCard
          key={image.id}
          image={image}
          active={activeImageIds.has(image.id)}
          focused={focusedImageId === image.id}
          rating={customerRatings[image.id] ?? 0}
          colorLabel={customerColorLabels[image.id] ?? null}
          pending={pendingImageIds.has(image.id)}
          mobile={mobile}
          quality={qualityResults[image.id]}
          onClick={onPhotoClick}
          onImageError={onImageError}
        />)}
      </div>
      {location.kind !== "root" && !visibleImageCount && !childFolders.length ? <div className={styles.empty}>이 폴더에 표시할 사진이 없습니다.</div> : null}
      {marquee ? <div className={styles.selectionMarquee} style={marquee} /> : null}
    </div>
    <footer className={styles.shortcutBar}><span>{activeRatingFilterName ? <b className={styles.shortcutActiveFilter}>{activeRatingFilterName}</b> : null}{activeColorFilterName ? <b className={styles.shortcutActiveFilter}>{activeColorFilterName}</b> : null}클릭 작업 대상 · Shift 범위 · ⌘/Ctrl 추가 · 1–5 별점 · 6–9 컬러 · 0 해제 · ⌘/Ctrl+B 리뷰 · ⌥⌘숫자 필터 · ⌥⌘A 전체 · ⌘F 검색</span>{location.kind !== "root" ? <label>썸네일 <input type="range" min={thumbMin} max={thumbMax} step={4} value={thumbSize} onChange={(event) => onThumbSizeChange(Number(event.currentTarget.value))} /></label> : null}</footer>
  </section>;
});
