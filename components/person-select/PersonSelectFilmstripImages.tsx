"use client";

import { memo, type RefObject } from "react";
import { Check } from "lucide-react";
import type { PersonSelectImageData } from "./usePersonChoiceSync";
import styles from "./PersonSelectPublic.module.css";

type PersonSelectFilmstripThumbnailProps = {
  image: PersonSelectImageData;
  current: boolean;
  selected: boolean;
  pending: boolean;
  activeThumbRef: RefObject<HTMLButtonElement | null>;
  onSelect: (imageId: string) => void;
};

function PersonSelectFilmstripThumbnailComponent({
  image,
  current,
  selected,
  pending,
  activeThumbRef,
  onSelect,
}: PersonSelectFilmstripThumbnailProps) {
  return <button
    ref={current ? activeThumbRef : undefined}
    className={`${styles.photoTile} ${current ? styles.pcThumbCurrent : ""} ${selected ? styles.photoTileSelected : ""} ${pending ? styles.photoTilePending : ""}`}
    onClick={() => onSelect(image.id)}
  >
    <img
      src={image.thumb_url}
      alt={image.original_file_name}
      loading="lazy"
      decoding="async"
      draggable={false}
      onContextMenu={(event) => event.preventDefault()}
    />
    {selected ? <span className={styles.check}><Check size={15} /></span> : null}
    {pending ? <span className={styles.pendingDot} aria-label="저장 안 된 변경" /> : null}
  </button>;
}

export function personSelectFilmstripThumbnailPropsEqual(
  previous: Readonly<PersonSelectFilmstripThumbnailProps>,
  next: Readonly<PersonSelectFilmstripThumbnailProps>,
) {
  return previous.image.id === next.image.id
    && previous.image.thumb_url === next.image.thumb_url
    && previous.image.original_file_name === next.image.original_file_name
    && previous.current === next.current
    && previous.selected === next.selected
    && previous.pending === next.pending
    && previous.activeThumbRef === next.activeThumbRef
    && previous.onSelect === next.onSelect;
}

const PersonSelectFilmstripThumbnail = memo(
  PersonSelectFilmstripThumbnailComponent,
  personSelectFilmstripThumbnailPropsEqual,
);

export const PersonSelectFilmstripImages = memo(function PersonSelectFilmstripImages({
  images,
  previewId,
  selectedIds,
  pendingImageIds,
  activeThumbRef,
  filmstripRef,
  onSelect,
  onScroll,
}: {
  images: readonly PersonSelectImageData[];
  previewId: string;
  selectedIds: ReadonlySet<string>;
  pendingImageIds: ReadonlySet<string>;
  activeThumbRef: RefObject<HTMLButtonElement | null>;
  filmstripRef: RefObject<HTMLDivElement | null>;
  onSelect: (imageId: string) => void;
  onScroll: () => void;
}) {
  return <div ref={filmstripRef} className={styles.pcThumbs} onScroll={onScroll}>
    {images.map((image) => <PersonSelectFilmstripThumbnail
      key={image.id}
      image={image}
      current={image.id === previewId}
      selected={selectedIds.has(image.id)}
      pending={pendingImageIds.has(image.id)}
      activeThumbRef={activeThumbRef}
      onSelect={onSelect}
    />)}
  </div>;
});
