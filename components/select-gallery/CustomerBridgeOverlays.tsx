"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type WheelEvent as ReactWheelEvent } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import { BRIDGE_COLOR_LABELS } from "@/lib/photo-bridge/labels";
import { bridgeReviewDeckWindow, bridgeReviewLayout, type BridgeReviewRemovedItem } from "@/lib/photo-bridge/reviewMode";
import { nextCustomerBridgeReviewZoom, type CustomerBridgeColorLabel, type CustomerBridgeRating } from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import { ColorLabels, RatingStars, StablePreviewImage } from "./CustomerBridgeMedia";
import styles from "./CustomerBridgeSelect.module.css";

export type CustomerBridgeReviewRemovedMarks = BridgeReviewRemovedItem & {
  rating: CustomerBridgeRating | null;
  colorLabel: CustomerBridgeColorLabel | null;
};

export function PhotoOverlay({ image, index, total, rating, colorLabel, note, zoomed, onZoom, onClose, onPrev, onNext, onRate, onColor, onNote, onImageError, readOnly }: {
  image: CustomerBridgeImage;
  index: number;
  total: number;
  rating: number;
  colorLabel: CustomerBridgeColorLabel | null;
  note: string;
  zoomed: boolean;
  onZoom: () => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRate: (rating: 0 | CustomerBridgeRating) => void;
  onColor: (colorLabel: CustomerBridgeColorLabel) => void;
  onNote: (value: string) => void;
  onImageError?: (imageId: string) => void;
  readOnly: boolean;
}) {
  const touchStart = useRef<number | null>(null);
  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="사진 전체화면" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current === null || end === undefined) return; const delta = end - touchStart.current; if (delta > 55) onPrev(); else if (delta < -55) onNext(); touchStart.current = null; }}>
    <div className={styles.overlayHeader}><button type="button" aria-label="닫기" onClick={onClose}><X /></button><div><strong>{image.original_file_name}</strong><span>{Math.max(0, index) + 1} / {total} · {rating ? `고객 ${rating}점` : colorLabel ? `${BRIDGE_COLOR_LABELS[colorLabel].name} 컬러` : "미선택"}</span></div><button type="button" onClick={onZoom}>{zoomed ? "화면 맞춤" : "확대"}</button></div>
    <div className={zoomed ? styles.overlayImageZoomed : styles.overlayImage} onDoubleClick={onZoom}><button type="button" aria-label="이전" onClick={onPrev}><ChevronLeft /></button><StablePreviewImage image={image} onImageError={onImageError} /><button type="button" aria-label="다음" onClick={onNext}><ChevronRight /></button></div>
    {!readOnly ? <div className={styles.overlayControls}><RatingStars value={rating} onChange={onRate} label="전체화면 고객 별점" /><ColorLabels value={colorLabel} onChange={onColor} label="전체화면 고객 컬러 셀렉" /><strong>{rating || colorLabel ? "고객 셀렉" : "별점이나 컬러를 눌러 고객 셀렉"}</strong><textarea value={note} maxLength={1000} onChange={(event) => onNote(event.target.value)} placeholder="사진별 보정 메모" /></div> : null}
  </div>;
}

export function ReviewOverlay({ images, activeId, removed, ratings, colorLabels, onActive, onClose, onRemove, onRestore, onRate, onColor, onFullscreen, onImageError }: {
  images: CustomerBridgeImage[];
  activeId: string | null;
  removed: CustomerBridgeReviewRemovedMarks | null;
  ratings: Record<string, CustomerBridgeRating>;
  colorLabels: Record<string, CustomerBridgeColorLabel>;
  onActive: (id: string) => void;
  onClose: () => void;
  onRemove: (id: string) => void;
  onRestore: () => void;
  onRate: (id: string, rating: 0 | CustomerBridgeRating) => void;
  onColor: (id: string, colorLabel: CustomerBridgeColorLabel) => void;
  onFullscreen: (id: string) => void;
  onImageError?: (imageId: string) => void;
}) {
  const touchStart = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const layout = bridgeReviewLayout(images.length);
  const activeIndex = Math.max(0, images.findIndex((image) => image.id === activeId));
  const displayed = layout === "deck" ? bridgeReviewDeckWindow(images, activeIndex) : images.map((image) => ({ item: image, offset: 0 }));
  const move = (delta: -1 | 1) => { if (images.length) onActive(images[(activeIndex + delta + images.length) % images.length].id); };
  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.deltaY) return;
    setZoom((current) => nextCustomerBridgeReviewZoom(current, event.deltaY));
  }, []);
  useEffect(() => setZoom(1), [activeId, layout]);

  return <div className={styles.reviewOverlay} role="dialog" aria-modal="true" aria-label="고객 셀렉 리뷰">
    <div className={styles.overlayHeader}><button type="button" aria-label="닫기" onClick={onClose}><X /></button><div><strong>고객 셀렉 리뷰</strong><span>{images.length}장 · {layout === "single" ? "한 장" : layout === "grid" ? "비교" : "로테이션"} · {Math.round(zoom * 100)}%</span></div><button type="button" disabled={!removed} onClick={onRestore}><RotateCcw size={15} /> 복원</button></div>
    <div className={`${styles.reviewStage} ${styles[`review_${layout}`]}`} title="마우스 휠 위로 확대 · 아래로 축소" onWheel={handleWheel} onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current === null || end === undefined) return; const delta = end - touchStart.current; if (delta > 55) move(-1); else if (delta < -55) move(1); touchStart.current = null; }}>
      {displayed.map(({ item, offset }) => {
        const style = { ...(layout === "deck" ? { "--deck-offset": offset } : {}), ...(item.id === activeId ? { "--review-zoom": zoom } : {}) } as CSSProperties;
        return <button key={item.id} type="button" className={styles.reviewPhoto} data-active={item.id === activeId || undefined} style={style} onClick={() => onActive(item.id)} onDoubleClick={() => onFullscreen(item.id)}><StablePreviewImage image={item} onImageError={onImageError} /><span>{item.original_file_name}{ratings[item.id] ? ` · ${ratings[item.id]}점` : ""}{colorLabels[item.id] ? ` · ${BRIDGE_COLOR_LABELS[colorLabels[item.id]].name}` : ""}</span></button>;
      })}
      {!images.length ? <div className={styles.reviewEmpty}>모든 사진을 제외했습니다. 위의 복원으로 직전 사진의 별점과 컬러를 되돌릴 수 있습니다.</div> : null}
    </div>
    {activeId ? <div className={styles.reviewControls}><button type="button" className={styles.reviewMoveButton} onClick={() => move(-1)} aria-label="이전 사진"><ChevronLeft size={17} /></button><RatingStars value={ratings[activeId] ?? 0} onChange={(rating) => onRate(activeId, rating)} label="리뷰 고객 별점" /><ColorLabels value={colorLabels[activeId] ?? null} onChange={(colorLabel) => onColor(activeId, colorLabel)} label="리뷰 고객 컬러 셀렉" /><button type="button" className={styles.reviewMoveButton} onClick={() => move(1)} aria-label="다음 사진"><ChevronRight size={17} /></button><button type="button" className={styles.removeButton} onClick={() => onRemove(activeId)}>셀렉 제외</button></div> : null}
  </div>;
}
