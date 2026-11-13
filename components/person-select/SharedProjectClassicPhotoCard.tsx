"use client";

import { memo } from "react";
import type { CustomerBridgeImage } from "@/components/select-gallery/CustomerBridgeSelect";
import styles from "./SharedProjectSelect.module.css";

type SharedProjectClassicPhotoCardProps = {
  image: CustomerBridgeImage;
  selected: boolean;
  pending: boolean;
  onToggle: (imageId: string) => void;
};

function SharedProjectClassicPhotoCardComponent({
  image,
  selected,
  pending,
  onToggle,
}: SharedProjectClassicPhotoCardProps) {
  return <button
    type="button"
    className={styles.card}
    data-selected={selected}
    data-pending={pending}
    onClick={() => onToggle(image.id)}
  >
    {image.thumbnail_url || image.image_url
      ? <img src={image.thumbnail_url || image.image_url} alt={image.original_file_name} loading="lazy" decoding="async" />
      : <span className={styles.imageLoading}>사진 불러오는 중</span>}
    <span>{image.original_file_name}</span>
    {selected ? <i className={styles.check}>✓</i> : null}
    {pending ? <i className={styles.pendingDot} aria-label="저장 안 된 변경" /> : null}
  </button>;
}

export function sharedProjectClassicPhotoCardPropsEqual(
  previous: Readonly<SharedProjectClassicPhotoCardProps>,
  next: Readonly<SharedProjectClassicPhotoCardProps>,
) {
  return previous.image.id === next.image.id
    && previous.image.thumbnail_url === next.image.thumbnail_url
    && previous.image.image_url === next.image.image_url
    && previous.image.original_file_name === next.image.original_file_name
    && previous.selected === next.selected
    && previous.pending === next.pending
    && previous.onToggle === next.onToggle;
}

export const SharedProjectClassicPhotoCard = memo(
  SharedProjectClassicPhotoCardComponent,
  sharedProjectClassicPhotoCardPropsEqual,
);
