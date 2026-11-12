"use client";

import { memo } from "react";
import { Check } from "lucide-react";
import type { PersonSelectImageData } from "./usePersonChoiceSync";
import styles from "./PersonSelectPublic.module.css";

type PersonSelectPhotoTileProps = {
  image: PersonSelectImageData;
  selected: boolean;
  pending: boolean;
  onOpen: (imageId: string) => void;
};

function PersonSelectPhotoTileComponent({ image, selected, pending, onOpen }: PersonSelectPhotoTileProps) {
  return <button
    type="button"
    className={`${styles.photoTile} ${selected ? styles.photoTileSelected : ""} ${pending ? styles.photoTilePending : ""}`}
    onClick={() => onOpen(image.id)}
  >
    <img
      src={image.thumb_url}
      alt={image.original_file_name}
      loading="lazy"
      decoding="async"
      draggable={false}
      onContextMenu={(event) => event.preventDefault()}
    />
    {selected ? <span className={styles.check}><Check size={17} /></span> : null}
    {pending ? <span className={styles.pendingDot} aria-label="저장 안 된 변경" /> : null}
  </button>;
}

export function personSelectPhotoTilePropsEqual(
  previous: Readonly<PersonSelectPhotoTileProps>,
  next: Readonly<PersonSelectPhotoTileProps>,
) {
  return previous.image.id === next.image.id
    && previous.image.thumb_url === next.image.thumb_url
    && previous.image.original_file_name === next.image.original_file_name
    && previous.selected === next.selected
    && previous.pending === next.pending
    && previous.onOpen === next.onOpen;
}

export const PersonSelectPhotoTile = memo(PersonSelectPhotoTileComponent, personSelectPhotoTilePropsEqual);
