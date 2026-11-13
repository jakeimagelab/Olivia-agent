"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonSelectImageData } from "./usePersonChoiceSync";
import {
  clearPersonSelectImageRequestCache,
  fetchPersonSelectImagePage,
  fetchPersonSelectPreviewUrls,
  type PersonSelectImagePage,
} from "./personSelectImageRequests";
import {
  clearPersonSelectImageCacheEntries,
  personSelectImageCacheKey,
  readPersonSelectImageCache,
  writePersonSelectImageCache,
} from "./personSelectImageCache";
import {
  mergePersonSelectImagePages,
  mergePersonSelectSeedImages,
  mergePersonSelectPreviewUrls,
} from "./personSelectImageState";

export {
  isPersonSelectImagePageNearEnd,
  mergePersonSelectImagePages,
  mergePersonSelectPreviewUrls,
} from "./personSelectImageState";

export function clearPersonSelectImageCache(slug: string) {
  clearPersonSelectImageCacheEntries(slug);
  clearPersonSelectImageRequestCache(slug);
}

export function usePersonSelectImages(
  slug: string,
  category: string,
  seedImages: readonly PersonSelectImageData[] = [],
) {
  const initialCache = readPersonSelectImageCache(slug, category);
  const [images, setImages] = useState<PersonSelectImageData[]>(() => mergePersonSelectImagePages(initialCache?.images ?? [], seedImages));
  const [loading, setLoading] = useState(() => !initialCache);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCache?.nextCursor ?? null);
  const [pageError, setPageError] = useState("");
  const imagesRef = useRef(images);
  const seedImagesRef = useRef(seedImages);
  const imageByIdRef = useRef(new Map(images.map((image) => [image.id, image])));
  const nextCursorRef = useRef(nextCursor);
  const loadMoreRef = useRef<Promise<boolean> | null>(null);
  const scopeRef = useRef(personSelectImageCacheKey(slug, category));
  const seedScopeRef = useRef(scopeRef.current);
  scopeRef.current = personSelectImageCacheKey(slug, category);
  seedImagesRef.current = seedImages;
  useEffect(() => { imagesRef.current = images; }, [images]);
  const installPage = useCallback((page: PersonSelectImagePage, reset: boolean) => {
    const base = reset ? seedImagesRef.current : imagesRef.current;
    const merged = mergePersonSelectImagePages(base, page.images);
    imagesRef.current = merged;
    imageByIdRef.current = new Map(merged.map((image) => [image.id, image]));
    nextCursorRef.current = page.nextCursor;
    writePersonSelectImageCache(slug, category, {
      images: merged,
      fetchedAt: Date.now(),
      nextCursor: page.nextCursor,
    });
    setImages(merged);
    setNextCursor(page.nextCursor);
    setPageError("");
  }, [category, slug]);

  useEffect(() => {
    let active = true;
    loadMoreRef.current = null;
    setLoadingMore(false);
    const entry = readPersonSelectImageCache(slug, category);
    const seeded = mergePersonSelectImagePages(entry?.images ?? [], seedImagesRef.current);
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
        const fallback = mergePersonSelectImagePages([], seedImagesRef.current);
        imagesRef.current = fallback;
        imageByIdRef.current = new Map(fallback.map((image) => [image.id, image]));
        setImages(fallback);
        setPageError(cause instanceof Error ? cause.message : "사진을 불러오지 못했어요.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category, installPage, slug]);

  useEffect(() => {
    const scopeKey = personSelectImageCacheKey(slug, category);
    if (seedScopeRef.current !== scopeKey) {
      seedScopeRef.current = scopeKey;
      return;
    }
    setImages((current) => {
      const merged = mergePersonSelectSeedImages(current, seedImages);
      if (merged === current) return current;
      imagesRef.current = merged;
      imageByIdRef.current = new Map(merged.map((image) => [image.id, image]));
      writePersonSelectImageCache(slug, category, {
        images: merged,
        fetchedAt: Date.now(),
        nextCursor: nextCursorRef.current,
      });
      return merged;
    });
  }, [category, seedImages, slug]);

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current;
    if (!cursor) return Promise.resolve(false);
    if (loadMoreRef.current) return loadMoreRef.current;
    const scopeKey = personSelectImageCacheKey(slug, category);
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
      writePersonSelectImageCache(slug, category, {
        images: merged,
        fetchedAt: Date.now(),
        nextCursor: nextCursorRef.current,
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
