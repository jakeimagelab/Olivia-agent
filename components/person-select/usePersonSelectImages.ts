"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PERSON_SELECT_IMAGE_PAGE_SIZE } from "@/lib/person-select/imagePaging";
import type { PersonSelectImageData } from "./usePersonChoiceSync";

type ImageCacheEntry = {
  images: PersonSelectImageData[];
  fetchedAt: number;
  nextCursor: string | null;
};
type PersonSelectImagePage = {
  images: PersonSelectImageData[];
  nextCursor: string | null;
};

const IMAGE_CACHE_MAX_AGE_MS = 9 * 60_000;
const imageCache = new Map<string, ImageCacheEntry>();
const imageRequests = new Map<string, Promise<PersonSelectImagePage>>();
const previewRequests = new Map<string, Promise<PersonSelectImageData[]>>();

function imageCacheKey(slug: string, category: string) {
  return `${slug}:${category}`;
}

export function clearPersonSelectImageCache(slug: string) {
  for (const key of imageCache.keys()) if (key.startsWith(`${slug}:`)) imageCache.delete(key);
  for (const key of imageRequests.keys()) if (key.startsWith(`${slug}:`)) imageRequests.delete(key);
  for (const key of previewRequests.keys()) if (key.startsWith(`${slug}:`)) previewRequests.delete(key);
}

function cachedEntry(slug: string, category: string) {
  const cached = imageCache.get(imageCacheKey(slug, category));
  return cached && Date.now() - cached.fetchedAt < IMAGE_CACHE_MAX_AGE_MS ? cached : null;
}

async function fetchImagePage(slug: string, category: string, cursor: string | null) {
  const key = `${imageCacheKey(slug, category)}:${cursor ?? "first"}`;
  const pending = imageRequests.get(key);
  if (pending) return pending;
  const params = new URLSearchParams({
    category,
    variant: "thumbnail",
    limit: String(PERSON_SELECT_IMAGE_PAGE_SIZE),
  });
  if (cursor) params.set("cursor", cursor);
  const request = fetch(`/api/pick/${slug}/images?${params.toString()}`, { cache: "no-store" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "사진을 불러오지 못했어요.");
      return {
        images: Array.isArray(data.images) ? data.images as PersonSelectImageData[] : [],
        nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
      };
    })
    .finally(() => imageRequests.delete(key));
  imageRequests.set(key, request);
  return request;
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

async function fetchPreviewUrls(slug: string, category: string, imageIds: readonly string[]) {
  const uniqueIds = [...new Set(imageIds.filter(Boolean))].slice(0, 8);
  if (!uniqueIds.length) return [];
  const key = `${slug}:${category}:${uniqueIds.slice().sort().join(",")}`;
  const pending = previewRequests.get(key);
  if (pending) return pending;
  const params = new URLSearchParams({ category, variant: "preview" });
  uniqueIds.forEach((imageId) => params.append("imageId", imageId));
  const request = fetch(`/api/pick/${slug}/images?${params.toString()}`, { cache: "no-store" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "미리보기를 불러오지 못했어요.");
      return data.images as PersonSelectImageData[];
    })
    .finally(() => previewRequests.delete(key));
  previewRequests.set(key, request);
  return request;
}

export function usePersonSelectImages(
  slug: string,
  category: string,
  seedImages: readonly PersonSelectImageData[] = [],
) {
  const initialCache = cachedEntry(slug, category);
  const [images, setImages] = useState<PersonSelectImageData[]>(() => mergePersonSelectImagePages(initialCache?.images ?? [], seedImages));
  const [loading, setLoading] = useState(() => !initialCache);
  const imagesRef = useRef(images);
  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const key = imageCacheKey(slug, category);
    const installPage = (page: PersonSelectImagePage, reset: boolean) => {
      const base = reset ? seedImages : imagesRef.current;
      const merged = mergePersonSelectImagePages(base, page.images);
      imagesRef.current = merged;
      imageCache.set(key, { images: merged, fetchedAt: Date.now(), nextCursor: page.nextCursor });
      if (active) setImages(merged);
      return merged;
    };
    const loadPages = async (startCursor: string | null, reset: boolean) => {
      let cursor = startCursor;
      let first = reset;
      do {
        const page = await fetchImagePage(slug, category, cursor);
        if (!active) return;
        installPage(page, first);
        first = false;
        setLoading(false);
        if (!page.nextCursor || page.nextCursor === cursor) return;
        cursor = page.nextCursor;
      } while (active);
    };
    const scheduleRefresh = (delay = IMAGE_CACHE_MAX_AGE_MS) => {
      refreshTimer = setTimeout(() => {
        imageCache.delete(key);
        void loadPages(null, true).then(() => scheduleRefresh()).catch(() => undefined);
      }, delay);
    };
    const entry = cachedEntry(slug, category);
    const seeded = mergePersonSelectImagePages(entry?.images ?? [], seedImages);
    imagesRef.current = seeded;
    setImages(seeded);
    if (entry) {
      setLoading(false);
      if (entry.nextCursor) void loadPages(entry.nextCursor, false).catch(() => undefined);
      scheduleRefresh(Math.max(1, IMAGE_CACHE_MAX_AGE_MS - (Date.now() - entry.fetchedAt)));
      return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); };
    }
    setLoading(true);
    loadPages(null, true)
      .then(() => { if (active) scheduleRefresh(); })
      .catch(() => {
        if (!active || imagesRef.current.length) return;
        const fallback = mergePersonSelectImagePages([], seedImages);
        imagesRef.current = fallback;
        setImages(fallback);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); };
  }, [category, seedImages, slug]);
  const ensurePreviews = useCallback(async (imageIds: readonly string[]) => {
    const missingIds = imageIds.filter((imageId) => {
      const image = imagesRef.current.find((item) => item.id === imageId);
      return image && !image.preview_url;
    });
    if (!missingIds.length) return;
    const previews = await fetchPreviewUrls(slug, category, missingIds);
    setImages((current) => {
      const merged = mergePersonSelectPreviewUrls(current, previews);
      imagesRef.current = merged;
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
  return { images, loading, ensurePreviews };
}
