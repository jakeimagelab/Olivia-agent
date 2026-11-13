"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { resolveClassicSelectionShortcut } from "@/lib/person-select/classicSelection";
import type { PersonSelectImageData } from "./usePersonChoiceSync";
import { isPersonSelectImagePageNearEnd } from "./usePersonSelectImages";

type PersonSelectPcNavigationOptions = {
  images: readonly PersonSelectImageData[];
  previewId: string;
  preview: PersonSelectImageData | undefined;
  previewIndex: number;
  chosenIds: ReadonlySet<string>;
  full: boolean;
  locked: boolean;
  hasMore: boolean;
  loadMore: () => Promise<unknown>;
  ensurePreviews: (imageIds: string[]) => Promise<unknown>;
  setPreviewId: Dispatch<SetStateAction<string>>;
  selectImage: (imageId: string) => void;
  clearImage: (imageId: string) => void;
};

export function usePersonSelectPcNavigation({
  images,
  previewId,
  preview,
  previewIndex,
  chosenIds,
  full,
  locked,
  hasMore,
  loadMore,
  ensurePreviews,
  setPreviewId,
  selectImage,
  clearImage,
}: PersonSelectPcNavigationOptions) {
  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (previewIndex < 0) return;
    const ids = [-2, -1, 0, 1, 2].flatMap((offset) => (
      images[previewIndex + offset]?.id ? [images[previewIndex + offset].id] : []
    ));
    void ensurePreviews(ids);
  }, [ensurePreviews, images, previewIndex]);

  useEffect(() => {
    if (hasMore && isPersonSelectImagePageNearEnd(previewIndex, images.length)) void loadMore();
  }, [hasMore, images.length, loadMore, previewIndex]);

  useEffect(() => {
    const filmstrip = filmstripRef.current;
    const thumbnail = activeThumbRef.current;
    if (!filmstrip || !thumbnail) return;
    filmstrip.scrollTo({
      left: thumbnail.offsetLeft - (filmstrip.clientWidth - thumbnail.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [previewId]);

  useEffect(() => {
    const filmstrip = filmstripRef.current;
    if (!filmstrip) return;
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      filmstrip.scrollLeft += event.deltaY;
    };
    filmstrip.addEventListener("wheel", handleWheel, { passive: false });
    return () => filmstrip.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!preview || event.repeat
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPreviewId(images[Math.max(0, previewIndex - 1)]?.id ?? preview.id);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPreviewId(images[Math.min(images.length - 1, previewIndex + 1)]?.id ?? preview.id);
      }
      if (event.key === " ") {
        event.preventDefault();
        if (!chosenIds.has(preview.id) && !full) selectImage(preview.id);
      }
      const shortcut = resolveClassicSelectionShortcut(event.key);
      if (shortcut === "select") {
        event.preventDefault();
        if (!chosenIds.has(preview.id) && !full && !locked) selectImage(preview.id);
      }
      if (shortcut === "clear") {
        event.preventDefault();
        if (chosenIds.has(preview.id) && !locked) clearImage(preview.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chosenIds, clearImage, full, images, locked, preview, previewIndex, selectImage, setPreviewId]);

  const scrollFilmstrip = useCallback((direction: -1 | 1) => {
    const filmstrip = filmstripRef.current;
    if (!filmstrip) return;
    filmstrip.scrollBy({ left: direction * filmstrip.clientWidth, behavior: "smooth" });
    if (direction > 0 && hasMore) void loadMore();
  }, [hasMore, loadMore]);

  const loadMoreNearFilmstripEnd = useCallback(() => {
    const filmstrip = filmstripRef.current;
    if (!filmstrip || !hasMore) return;
    if (filmstrip.scrollWidth - filmstrip.scrollLeft - filmstrip.clientWidth < 800) void loadMore();
  }, [hasMore, loadMore]);

  return {
    filmstripRef,
    activeThumbRef,
    scrollFilmstrip,
    loadMoreNearFilmstripEnd,
  };
}
