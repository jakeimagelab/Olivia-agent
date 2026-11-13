"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonSelectImageData } from "./usePersonChoiceSync";
import {
  clearPersonSelectImageRequestCache,
  fetchPersonSelectImagePage,
  fetchPersonSelectPreviewUrls,
  type PersonSelectImagePage,
} from "./personSelectImageRequests";

type ImageCacheEntry = {
  images: PersonSelectImageData[];
  fetchedAt: number;
  nextCursor: string | null;
};
const IMAGE_CACHE_MAX_AGE_MS = 9 * 60_000;
const imageCache = new Map<string, ImageCacheEntry>();

function imageCacheKey(slug: string, category: string) {
  return `${slug}:${category}`;
}

export function clearPersonSelectImageCache(slug: string) {
  for (const key of imageCache.keys()) if (key.startsWith(`${slug}:`)) imageCache.delete(key);
  clearPersonSelectImageRequestCache(slug);
}

function cachedEntry(slug: string, category: string) {
  const cached = imageCache.get(imageCacheKey(slug, category));
  return cached && Date.now() - cached.fetchedAt < IMAGE_CACHE_MAX_AGE_MS ? cached : null;
}

function imageSortOrder(image: PersonSelectImageData) {
  return Number.isFinite(image.sort_order) ? Number(image.sort_order) : Number.MAX_SAFE_INTEGER;
}

export function mergePersonSelectImagePages(
  current: readonly PersonSelectImageData[],
  incoming: readonly PersonSelectImageData[],
) {
  const byId = new Map(current.map((image) => [image.id, image]));
  for (const image of incoming) {
    const previous = byId.get(image.id);
    byId.set(image.id, {
      ...previous,
      ...image,
      thumb_url: image.thumb_url || previous?.thumb_url || "",
      preview_url: image.preview_url || previous?.preview_url || "",
    });
  }
  return [...byId.values()].sort((left, right) => (
    imageSortOrder(left) - imageSortOrder(right)
    || left.original_file_name.localeCompare(right.original_file_name, "ko-KR")
    || left.id.localeCompare(right.id)
  ));
}

export function mergePersonSelectPreviewUrls(
  images: readonly PersonSelectImageData[],
  previews: readonly Pick<PersonSelectImageData, "id" | "preview_url">[],
) {
  const previewById = new Map(previews.map((image) => [image.id, image.preview_url]));
  return images.map((image) => previewById.has(image.id) ? { ...image, preview_url: previewById.get(image.id) ?? image.preview_url } : image);
}

export function isPersonSelectImagePageNearEnd(index: number, loadedCount: number, threshold = 12) {
  return loadedCount > 0 && index >= Math.max(0, loadedCount - threshold);
}

export function usePersonSelectImages(
  slug: string,
  category: string,
  seedImages: readonly PersonSelectImageData[] = [],
) {
  const initialCache = cachedEntry(slug, category);
  const [images, setImages] = useState<PersonSelectImageData[]>(() => mergePersonSelectImagePages(initialCache?.images ?? [], seedImages));
  const [loading, setLoading] = useState(() => !initialCache);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCache?.nextCursor ?? null);
  const [pageError, setPageError] = useState("");
  const imagesRef = useRef(images);
  const imageByIdRef = useRef(new Map(images.map((image) => [image.id, image])));
  const nextCursorRef = useRef(nextCursor);
  const loadMoreRef = useRef<Promise<boolean> | null>(null);
  const scopeRef = useRef(imageCacheKey(slug, category));
  scopeRef.current = imageCacheKey(slug, category);
  useEffect(() => { imagesRef.current = images; }, [images]);
  const installPage = useCallback((page: PersonSelectImagePage, reset: boolean) => {
    const key = imageCacheKey(slug, category);
    const base = reset ? seedImages : imagesRef.current;
    const merged = mergePersonSelectImagePages(base, page.images);
    imagesRef.current = merged;
    imageByIdRef.current = new Map(merged.map((image) => [image.id, image]));
    nextCursorRef.current = page.nextCursor;
    imageCache.set(key, { images: merged, fetchedAt: Date.now(), nextCursor: page.nextCursor });
    setImages(merged);
    setNextCursor(page.nextCursor);
    setPageError("");
  }, [category, seedImages, slug]);

  useEffect(() => {
    let active = true;
    loadMoreRef.current = null;
    setLoadingMore(false);
    const entry = cachedEntry(slug, category);
    const seeded = mergePersonSelectImagePages(entry?.images ?? [], seedImages);
    imagesRef.current = seeded;
    imageByIdRef.current = new Map(seeded.map((image) => [image.id, image]));
    nextCursorRef.current = entry?.nextCursor ?? null;
    setImages(seeded);
    setNextCursor(entry?.nextCursor ?? null);
    setPageError("");
    if (entry) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void fetchPersonSelectImagePage(slug, category, null)
      .then((page) => {
        if (!active) return;
        installPage(page, true);
      })
      .catch((cause) => {
        if (!active || imagesRef.current.length) return;
        const fallback = mergePersonSelectImagePages([], seedImages);
        imagesRef.current = fallback;
        imageByIdRef.current = new Map(fallback.map((image) => [image.id, image]));
        setImages(fallback);
        setPageError(cause instanceof Error ? cause.message : "사진을 불러오지 못했어요.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category, installPage, seedImages, slug]);

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current;
    if (!cursor) return Promise.resolve(false);
    if (loadMoreRef.current) return loadMoreRef.current;
    const scopeKey = imageCacheKey(slug, category);
    setLoadingMore(true);
    setPageError("");
    const request = fetchPersonSelectImagePage(slug, category, cursor)
      .then((page) => {
        if (scopeRef.current !== scopeKey) return false;
        installPage(page.nextCursor === cursor ? { ...page, nextCursor: null } : page, false);
        return true;
      })
      .catch((cause) => {
        if (scopeRef.current !== scopeKey) return false;
        setPageError(cause instanceof Error ? cause.message : "다음 사진을 불러오지 못했어요.");
        return false;
      })
      .finally(() => {
        if (loadMoreRef.current !== request) return;
        loadMoreRef.current = null;
        if (scopeRef.current === scopeKey) setLoadingMore(false);
      });
    loadMoreRef.current = request;
    return request;
  }, [category, installPage, slug]);

  const ensurePreviews = useCallback(async (imageIds: readonly string[]) => {
    const missingIds = imageIds.filter((imageId) => {
      const image = imageByIdRef.current.get(imageId);
      return image && !image.preview_url;
    });
    if (!missingIds.length) return;
    const previews = await fetchPersonSelectPreviewUrls(slug, category, missingIds);
    setImages((current) => {
      const merged = mergePersonSelectPreviewUrls(current, previews);
      imagesRef.current = merged;
      imageByIdRef.current = new Map(merged.map((image) => [image.id, image]));
      const cached = imageCache.get(imageCacheKey(slug, category));
      imageCache.set(imageCacheKey(slug, category), {
        images: merged,
        fetchedAt: Date.now(),
        nextCursor: cached?.nextCursor ?? null,
      });
      return merged;
    });
    for (const preview of previews) if (preview.preview_url) new Image().src = preview.preview_url;
  }, [category, slug]);
  return {
    images,
    loading,
    loadingMore,
    pageError,
    hasMore: Boolean(nextCursor),
    loadMore,
    ensurePreviews,
  };
}
