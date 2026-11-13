"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import {
  reconcileSelectionMediaImages,
  SELECTION_THUMBNAIL_PAGE_SIZE,
  type ResolvedSelectionMediaEntry,
  type SelectionMediaUrls,
  type SelectionMediaVariant,
} from "@/lib/select-gallery/mediaLoading";

type SharedProjectClassicFilter = "all" | "selected";

export type SharedProjectClassicImageUrls = Record<string, SelectionMediaUrls>;

export function useSharedProjectClassicMedia({
  initialImages,
  selected,
  filter,
  hasMoreImages,
  imagePageLoading,
  loadMoreImages,
  loadImageUrls,
  onError,
}: {
  initialImages: CustomerBridgeImage[];
  selected: ReadonlySet<string>;
  filter: SharedProjectClassicFilter;
  hasMoreImages: boolean;
  imagePageLoading: boolean;
  loadMoreImages: () => Promise<boolean>;
  loadImageUrls: (
    imageIds: string[],
    options?: { variant: SelectionMediaVariant },
  ) => Promise<SharedProjectClassicImageUrls>;
  onError: (message: string) => void;
}) {
  const [urlOverrides, setUrlOverrides] = useState<SharedProjectClassicImageUrls>({});
  const [renderLimit, setRenderLimit] = useState(SELECTION_THUMBNAIL_PAGE_SIZE);
  const loadingIdsRef = useRef(new Set<string>());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const resolvedEntriesRef = useRef(
    new Map<string, ResolvedSelectionMediaEntry<CustomerBridgeImage>>(),
  );

  const resolved = useMemo(
    () => reconcileSelectionMediaImages(initialImages, urlOverrides, resolvedEntriesRef.current),
    [initialImages, urlOverrides],
  );
  const visibleImages = useMemo(
    () => filter === "selected"
      ? resolved.images.filter((image) => selected.has(image.id))
      : resolved.images,
    [filter, resolved.images, selected],
  );
  const renderedImages = useMemo(
    () => visibleImages.slice(0, renderLimit),
    [renderLimit, visibleImages],
  );

  useEffect(() => {
    resolvedEntriesRef.current = resolved.entries;
  }, [resolved.entries]);

  useEffect(() => {
    setRenderLimit(SELECTION_THUMBNAIL_PAGE_SIZE);
  }, [filter]);

  useEffect(() => {
    const missingIds = renderedImages
      .filter((image) => !image.thumbnail_url && !loadingIdsRef.current.has(image.id))
      .map((image) => image.id);
    if (!missingIds.length) return;

    missingIds.forEach((imageId) => loadingIdsRef.current.add(imageId));
    void loadImageUrls(missingIds, { variant: "thumbnail" })
      .then((next) => setUrlOverrides((current) => ({ ...current, ...next })))
      .catch((cause) => onError(
        cause instanceof Error ? cause.message : "사진을 불러오지 못했습니다.",
      ))
      .finally(() => missingIds.forEach((imageId) => loadingIdsRef.current.delete(imageId)));
  }, [loadImageUrls, onError, renderedImages]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setRenderLimit((current) => {
        const next = Math.min(
          visibleImages.length,
          current + SELECTION_THUMBNAIL_PAGE_SIZE,
        );
        if (next === current && hasMoreImages && !imagePageLoading) {
          void loadMoreImages();
        }
        return next;
      });
    }, { rootMargin: "800px 0px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreImages, imagePageLoading, loadMoreImages, visibleImages.length]);

  return {
    images: resolved.images,
    renderedImages,
    sentinelRef,
  };
}
