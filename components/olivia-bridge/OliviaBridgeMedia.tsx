"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  File,
  Images,
  LoaderCircle,
  Maximize2,
  Star,
  X,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import type { BridgeJpgFile, BridgeRawFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  BRIDGE_COLOR_LABELS,
  type BridgeColorLabel,
} from "@/lib/photo-bridge/labels";
import {
  bridgeReviewDeckWindow,
  bridgeReviewLayout,
} from "@/lib/photo-bridge/reviewMode";
import type { AdobeBridgeMark } from "@/lib/selectMatch/bridgeRating";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import { getBridgeThumbnailUrl } from "@/lib/photo-bridge/thumbnailCache";
import styles from "./OliviaBridgeWorkspace.module.css";

export function formatBridgeTimestamp(photo: BridgeJpgFile) {
  const timestamp = photo.captureTimestamp ?? photo.lastModified;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "촬영시각 없음";
  const formatted = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
  return `${photo.timestampSource === "mtime" || !photo.timestampSource ? "수정시각" : "촬영시각"} ${formatted}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
}

export function BridgeThumbnail({
  photo,
  alt = "",
  eager = false,
}: {
  photo: BridgeJpgFile;
  alt?: string;
  eager?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    const load = () => void getBridgeThumbnailUrl(photo)
      .then((next) => { if (active) setUrl(next); })
      .catch(() => undefined);
    if (eager || !hostRef.current || typeof IntersectionObserver === "undefined") load();
    else {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      }, { rootMargin: "500px" });
      observer.observe(hostRef.current);
      return () => { active = false; observer.disconnect(); };
    }
    return () => { active = false; };
  }, [eager, photo]);

  return (
    <div ref={hostRef} className={styles.thumbnailMedia}>
      {url
        ? <img src={url} alt={alt} draggable={false} decoding="async" />
        : <LoaderCircle className={styles.spin} size={18} aria-label="썸네일 불러오는 중" />}
    </div>
  );
}

export const BridgePhotoCard = memo(function BridgePhotoCard({
  photo,
  selected,
  customerSelected,
  customerRating,
  focused,
  adobeSelected,
  manualSelected,
  excluded,
  rating,
  colorLabel,
  quality,
  rawMark,
}: {
  photo: BridgeJpgFile;
  selected: boolean;
  customerSelected: boolean;
  customerRating: number;
  focused: boolean;
  adobeSelected: boolean;
  manualSelected: boolean;
  excluded: boolean;
  rating: number;
  colorLabel?: BridgeColorLabel;
  quality?: PublicPhotoQualityResult;
  rawMark?: AdobeBridgeMark;
}) {
  const color = colorLabel ? BRIDGE_COLOR_LABELS[colorLabel] : null;
  const rawColor = rawMark?.colorLabel ? BRIDGE_COLOR_LABELS[rawMark.colorLabel] : null;
  return (
    <button
      type="button"
      data-bridge-photo-id={photo.id}
      data-nested={photo.relativeDirectory ? "true" : "false"}
      data-selection-source={adobeSelected ? "adobe" : manualSelected ? "manual" : "none"}
      className={`${styles.thumbnailCard} ${selected ? styles.selected : ""} ${adobeSelected ? styles.adobeSelected : ""} ${manualSelected ? styles.manualSelected : ""} ${focused ? styles.focused : ""} ${excluded ? styles.excluded : ""}`}
      aria-label={`${photo.name}${adobeSelected ? ", Adobe 선택" : manualSelected ? ", 직접 선택" : ""}${customerSelected ? ", 고객 선택" : ""}${focused ? ", 현재 포커스" : ""}`}
      aria-pressed={selected}
    >
      <BridgeThumbnail photo={photo} alt={photo.name} />
      {adobeSelected ? <span className={styles.sourceBadge}>Adobe</span> : null}
      {selected ? <span className={styles.adminSelectionBadge}>내 셀렉</span> : null}
      {customerSelected ? <span className={styles.customerSelectionBadge}>고객{customerRating ? ` ★${customerRating}` : ""}</span> : null}
      {quality && (quality.flags.length || quality.status === "needs_review") ? <span className={styles.aiQualityBadge}><CircleAlert size={11} />{quality.flags.length || "?"}</span> : null}
      <span className={styles.photoName}>{photo.name}</span>
      {photo.relativeDirectory ? <span className={styles.photoPath}>{photo.relativeDirectory}</span> : null}
      {rawMark?.rating ? <span className={styles.rawMarkBadge}>RAW ★{rawMark.rating}</span> : null}
      {rawColor ? <span className={styles.rawColorBadge}><i style={{ background: rawColor.color }} />RAW {rawColor.name}</span> : null}
      {rating ? <span className={styles.rating}><Star size={11} fill="currentColor" />{rating}</span> : null}
      {color ? <span className={styles.colorLabelMark} style={{ background: color.color }} aria-label={`${color.name} 컬러 레이블`} /> : null}
      {excluded ? <span className={styles.rejectMark}>X</span> : null}
    </button>
  );
});

export function BridgePreviewImage({
  photo,
  onSize,
}: {
  photo: BridgeJpgFile;
  onSize?: (size: { width: number; height: number }) => void;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!photo.file) {
      setUrl(photo.thumbnailUrl);
      return;
    }
    const next = URL.createObjectURL(photo.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);
  return url ? (
    <img
      src={url}
      alt={photo.name}
      draggable={false}
      decoding="async"
      onLoad={onSize ? (event) => onSize({
        width: event.currentTarget.naturalWidth,
        height: event.currentTarget.naturalHeight,
      }) : undefined}
    />
  ) : <LoaderCircle className={styles.spin} size={24} />;
}

export function BridgeFullscreenPreview({
  photo,
  position,
  total,
  rating,
  colorLabel,
  canMovePrevious,
  canMoveNext,
  onMove,
  onClose,
}: {
  photo: BridgeJpgFile;
  position: number;
  total: number;
  rating: number;
  colorLabel?: BridgeColorLabel;
  canMovePrevious: boolean;
  canMoveNext: boolean;
  onMove: (delta: number) => void;
  onClose: () => void;
}) {
  const color = colorLabel ? BRIDGE_COLOR_LABELS[colorLabel] : null;
  return (
    <section className={styles.fullscreenPreview} role="dialog" aria-modal="true" aria-label="사진 전체화면 미리보기">
      <BridgePreviewImage photo={photo} />
      <button type="button" className={styles.fullscreenClose} onClick={onClose} aria-label="전체화면 닫기">
        <X size={25} strokeWidth={1.8} />
      </button>
      <button type="button" className={`${styles.fullscreenArrow} ${styles.fullscreenArrowLeft}`} onClick={() => onMove(-1)} disabled={!canMovePrevious} aria-label="이전 사진">
        <ChevronLeft size={30} strokeWidth={1.6} />
      </button>
      <button type="button" className={`${styles.fullscreenArrow} ${styles.fullscreenArrowRight}`} onClick={() => onMove(1)} disabled={!canMoveNext} aria-label="다음 사진">
        <ChevronRight size={30} strokeWidth={1.6} />
      </button>
      <div className={styles.fullscreenLabelBar}>
        <div><strong>{photo.name}</strong><span>{position.toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")}</span></div>
        <div className={styles.fullscreenActiveLabels}>
          {rating ? <span className={styles.fullscreenRating}><Star size={13} fill="currentColor" /> {rating}</span> : null}
          {color ? <span><i style={{ background: color.color }} />{color.name}</span> : null}
          {!rating && !color ? <small>레이블 없음</small> : null}
        </div>
        <p>1–5 별점 · 0 해제 · 6–9 컬러 · ⌥⌘ 숫자만 보기 · ⌥⌘A 전체</p>
      </div>
    </section>
  );
}

export function BridgeSelectionReview({
  photos,
  activeId,
  rating,
  colorLabel,
  excluded,
  removedCount,
  onFocus,
  onMove,
  onRemove,
  onRestore,
  onOpenFullscreen,
  onClose,
}: {
  photos: BridgeJpgFile[];
  activeId: string | null;
  rating: number;
  colorLabel?: BridgeColorLabel;
  excluded: boolean;
  removedCount: number;
  onFocus: (id: string) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onRestore: () => void;
  onOpenFullscreen: () => void;
  onClose: () => void;
}) {
  const layout = bridgeReviewLayout(photos.length);
  const activeIndex = Math.max(0, photos.findIndex((photo) => photo.id === activeId));
  const activePhoto = photos[activeIndex] ?? null;
  const color = colorLabel ? BRIDGE_COLOR_LABELS[colorLabel] : null;
  const deck = bridgeReviewDeckWindow(photos, activePhoto ? activeIndex : -1);

  const photoCard = (photo: BridgeJpgFile, active: boolean) => (
    <button key={photo.id} type="button" className={styles.reviewPhotoCard} data-active={active ? "true" : "false"} onClick={() => onFocus(photo.id)} aria-label={`${photo.name}${active ? ", 현재 사진" : ""}`}>
      <BridgePreviewImage photo={photo} />
      <span><strong>{photo.name}</strong>{active ? <small>현재 사진</small> : null}</span>
    </button>
  );

  return (
    <section className={styles.selectionReview} role="dialog" aria-modal="true" aria-label="선택 사진 리뷰">
      <header className={styles.reviewHeader}>
        <div><strong>선택 사진 리뷰</strong><span>{photos.length.toLocaleString("ko-KR")}장 · {layout === "deck" ? "로테이션" : layout === "grid" ? "비교 보기" : "한 장 보기"}</span></div>
        <button type="button" onClick={onClose} aria-label="리뷰 나가기"><X size={22} /></button>
      </header>
      <div className={styles.reviewStage} data-layout={layout}>
        {!photos.length ? <div className={styles.reviewEmpty}><Images size={34} /><strong>모든 사진을 선택 해제했습니다.</strong><span>↑ 키로 마지막 사진을 다시 선택할 수 있어요.</span></div> : null}
        {layout === "single" && activePhoto ? photoCard(activePhoto, true) : null}
        {layout === "grid" ? <div className={styles.reviewGrid}>{photos.map((photo) => photoCard(photo, photo.id === activePhoto?.id))}</div> : null}
        {layout === "deck" ? <div className={styles.reviewDeck}>{deck.map(({ item, offset }) => {
          const active = offset === 0;
          return <button key={item.id} type="button" className={styles.reviewDeckCard} data-offset={offset} data-active={active ? "true" : "false"} onClick={() => onFocus(item.id)} aria-label={`${item.name}${active ? ", 현재 사진" : ""}`}>{active ? <BridgePreviewImage photo={item} /> : <BridgeThumbnail photo={item} alt={item.name} eager />}<span>{item.name}</span></button>;
        })}</div> : null}
      </div>
      <footer className={styles.reviewFooter}>
        <div className={styles.reviewCurrent}><strong>{activePhoto?.name ?? "선택 사진 없음"}</strong><span>{activePhoto ? `${activeIndex + 1} / ${photos.length}` : "↑ 복원 가능"}</span>{rating ? <b><Star size={12} fill="currentColor" /> {rating}</b> : null}{color ? <b><i style={{ background: color.color }} />{color.name}</b> : null}{excluded ? <b className={styles.reviewExcluded}>X 제외</b> : null}</div>
        <div className={styles.reviewControls}>
          <button type="button" disabled={!photos.length} onClick={() => onMove(-1)} aria-label="이전 사진"><ChevronLeft size={18} /></button>
          <button type="button" disabled={!photos.length} onClick={onRemove}><ArrowDown size={17} /> 선택 해제</button>
          <button type="button" disabled={!removedCount} onClick={onRestore}><ArrowUp size={17} /> 다시 선택</button>
          <button type="button" disabled={!activePhoto} onClick={onOpenFullscreen}><Maximize2 size={16} /> 크게 보기</button>
          <button type="button" disabled={!photos.length} onClick={() => onMove(1)} aria-label="다음 사진"><ChevronRight size={18} /></button>
        </div>
        <p>←→ 이동 · ↓ 해제 · ↑ 복원 · Space 크게 보기 · 1–5 별점 · 0 해제 · 6–9 컬러 · X 제외 · ESC 나가기</p>
      </footer>
    </section>
  );
}

export function PlainFileCard({
  file,
  active,
  mark,
  onClick,
}: {
  file: BridgeRawFile;
  active: boolean;
  mark?: AdobeBridgeMark;
  onClick: () => void;
}) {
  const color = mark?.colorLabel ? BRIDGE_COLOR_LABELS[mark.colorLabel] : null;
  return (
    <button type="button" className={styles.plainFileCard} data-active={active} onClick={onClick}>
      <File size={30} strokeWidth={1.5} aria-hidden="true" />
      <span>{file.extension}</span>
      <strong title={file.name}>{file.name}</strong>
      <small>{formatBytes(file.size)}</small>
      {mark?.rating ? <em><Star size={11} fill="currentColor" />RAW ★{mark.rating}</em> : null}
      {color ? <em><i style={{ background: color.color }} />RAW {color.name}</em> : null}
    </button>
  );
}
