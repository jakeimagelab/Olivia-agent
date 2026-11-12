"use client";

/* eslint-disable @next/next/no-img-element */

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, LoaderCircle, Star, StarOff } from "lucide-react";
import { BRIDGE_COLOR_LABELS } from "@/lib/photo-bridge/labels";
import type { CustomerBridgeColorLabel, CustomerBridgeRating } from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import styles from "./CustomerBridgeSelect.module.css";

const PREVIEW_CACHE_LIMIT = 12;
const previewImageCache = new Map<string, Promise<void>>();

export type CustomerBridgeSelectionModifiers = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

function touchPreviewCache(url: string, task: Promise<void>) {
  previewImageCache.delete(url);
  previewImageCache.set(url, task);
  while (previewImageCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewImageCache.keys().next().value as string | undefined;
    if (!oldest) break;
    previewImageCache.delete(oldest);
  }
}

function preparePreviewImage(url: string) {
  if (!url) return Promise.resolve();
  const cached = previewImageCache.get(url);
  if (cached) {
    touchPreviewCache(url, cached);
    return cached;
  }
  const task = new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
    if (image.complete) resolve();
  });
  touchPreviewCache(url, task);
  return task;
}

export function useAdjacentPreviewPreload(images: readonly CustomerBridgeImage[], activeId: string | null, radius = 2) {
  useEffect(() => {
    if (!activeId || typeof window === "undefined") return;
    const index = images.findIndex((image) => image.id === activeId);
    if (index < 0) return;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const candidate = images[index + offset];
      if (candidate?.image_url) void preparePreviewImage(candidate.image_url);
    }
  }, [activeId, images, radius]);
}

export function RatingStars({ value, onChange, label = "고객 별점" }: {
  value: number;
  onChange?: (rating: 0 | CustomerBridgeRating) => void;
  label?: string;
}) {
  return <div className={styles.ratingStars} role="group" aria-label={label}>
    {[1, 2, 3, 4, 5].map((rating) => <button
      key={rating}
      type="button"
      title={`${rating}점 (${rating})`}
      aria-label={`${rating}점 셀렉`}
      aria-pressed={value >= rating}
      disabled={!onChange}
      onClick={() => onChange?.(rating as CustomerBridgeRating)}
    ><Star size={18} fill={value >= rating ? "currentColor" : "none"} /></button>)}
    <button
      type="button"
      className={styles.ratingClear}
      title="셀렉 해제 (0)"
      aria-label="셀렉 해제 (0)"
      disabled={!onChange || value === 0}
      onClick={() => onChange?.(0)}
    ><StarOff size={18} /></button>
  </div>;
}

export function ColorLabels({ value, onChange, label = "고객 컬러 셀렉" }: {
  value: CustomerBridgeColorLabel | null;
  onChange?: (colorLabel: CustomerBridgeColorLabel) => void;
  label?: string;
}) {
  return <div className={styles.colorLabels} role="group" aria-label={label}>
    {(Object.entries(BRIDGE_COLOR_LABELS) as Array<[`${CustomerBridgeColorLabel}`, { name: string; color: string }]>).map(([key, color]) => {
      const colorLabel = Number(key) as CustomerBridgeColorLabel;
      return <button
        key={key}
        type="button"
        title={`${color.name} 컬러 셀렉 (${key})`}
        aria-label={`${color.name} 컬러 셀렉`}
        aria-pressed={value === colorLabel}
        disabled={!onChange}
        style={{ "--customer-label-color": color.color } as CSSProperties}
        onClick={() => onChange?.(colorLabel)}
      ><span />{key}</button>;
    })}
  </div>;
}

export function StablePreviewImage({ image, onImageError }: { image: CustomerBridgeImage; onImageError?: (imageId: string) => void }) {
  const [displayed, setDisplayed] = useState(image);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (displayed.id === image.id && displayed.image_url === image.image_url) return;
    if (!image.image_url) {
      setDisplayed(image);
      setLoading(true);
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    void preparePreviewImage(image.image_url).then(() => {
      if (requestRef.current !== request) return;
      setDisplayed(image);
      setLoading(false);
    });
  }, [displayed.id, displayed.image_url, image]);

  return <div className={styles.stablePreviewImage} data-loading={loading || undefined}>
    {displayed.image_url ? <img src={displayed.image_url} alt={displayed.original_file_name} draggable={false} decoding="async" onError={() => onImageError?.(image.id)} /> : null}
    {loading || !displayed.image_url ? <span><LoaderCircle size={20} aria-label="사진 불러오는 중" /></span> : null}
  </div>;
}

export const CustomerBridgeThumbnailCard = memo(function CustomerBridgeThumbnailCard({ image, active, focused, rating, colorLabel, pending, mobile, onClick, onImageError, quality }: {
  image: CustomerBridgeImage;
  active: boolean;
  focused: boolean;
  rating: number;
  colorLabel: CustomerBridgeColorLabel | null;
  pending: boolean;
  mobile: boolean;
  onClick: (image: CustomerBridgeImage, modifiers: CustomerBridgeSelectionModifiers) => void;
  onImageError?: (imageId: string) => void;
  quality?: PublicPhotoQualityResult;
}) {
  return <article
    role="button"
    tabIndex={0}
    data-bridge-card
    data-bridge-image-id={image.id}
    className={`${styles.thumbnailCard} ${active ? styles.activeThumbnail : ""} ${focused ? styles.focusedThumbnail : ""} ${pending ? styles.pendingThumbnail : ""}`}
    onClick={(event) => onClick(image, event)}
    onKeyDown={(event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      onClick(image, event);
    }}
    aria-label={`${image.original_file_name}${rating ? `, 고객 ${rating}점 셀렉` : ""}${colorLabel ? `, ${BRIDGE_COLOR_LABELS[colorLabel].name} 컬러 셀렉` : ""}${active ? ", 작업 대상" : ""}`}
  >
    <span className={styles.thumbnailMedia}>{image.thumbnail_url || image.image_url
      ? <img src={image.thumbnail_url || image.image_url} alt={image.original_file_name} loading="lazy" decoding="async" draggable={false} onError={() => onImageError?.(image.id)} />
      : <LoaderCircle className={styles.thumbnailLoading} size={20} aria-label="썸네일 불러오는 중" />}</span>
    {rating ? <span className={styles.ratingBadge}><Star size={12} fill="currentColor" />{rating}</span> : null}
    {colorLabel ? <span className={styles.colorLabelBadge} style={{ background: BRIDGE_COLOR_LABELS[colorLabel].color }} aria-label={`${BRIDGE_COLOR_LABELS[colorLabel].name} 컬러`} /> : null}
    {quality && (quality.flags.length || quality.status === "needs_review") ? <span className={styles.qualityBadge} title={quality.flags.length ? "AI 품질 문제 의심" : "AI 확인 필요"}><AlertTriangle size={12} />{quality.flags.length || "?"}</span> : null}
    {pending ? <span className={styles.pendingDot} title="저장 안 된 변경" aria-label="저장 안 된 변경" /> : null}
    <span className={styles.photoName}>{image.original_file_name}</span>
    {mobile && focused ? <span className={styles.mobileFocusedLabel}>미리보기</span> : null}
  </article>;
});
