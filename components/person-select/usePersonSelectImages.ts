"use client";

import { useEffect, useState } from "react";
import type { PersonSelectImageData } from "./usePersonChoiceSync";

type ImageCacheEntry = { images: PersonSelectImageData[]; fetchedAt: number };

const IMAGE_CACHE_MAX_AGE_MS = 9 * 60_000;
const imageCache = new Map<string, ImageCacheEntry>();
const imageRequests = new Map<string, Promise<PersonSelectImageData[]>>();

function imageCacheKey(slug: string, category: string) {
  return `${slug}:${category}`;
}

export function clearPersonSelectImageCache(slug: string) {
  for (const key of imageCache.keys()) if (key.startsWith(`${slug}:`)) imageCache.delete(key);
  for (const key of imageRequests.keys()) if (key.startsWith(`${slug}:`)) imageRequests.delete(key);
}

function cachedImages(slug: string, category: string) {
  const cached = imageCache.get(imageCacheKey(slug, category));
  return cached && Date.now() - cached.fetchedAt < IMAGE_CACHE_MAX_AGE_MS ? cached.images : null;
}

async function fetchImages(slug: string, category: string) {
  const key = imageCacheKey(slug, category);
  const cached = cachedImages(slug, category);
  if (cached) return cached;
  const pending = imageRequests.get(key);
  if (pending) return pending;
  const request = fetch(`/api/pick/${slug}/images?category=${encodeURIComponent(category)}`, { cache: "no-store" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "사진을 불러오지 못했어요.");
      const images = data.images as PersonSelectImageData[];
      imageCache.set(key, { images, fetchedAt: Date.now() });
      return images;
    })
    .finally(() => imageRequests.delete(key));
  imageRequests.set(key, request);
  return request;
}

export function usePersonSelectImages(slug: string, category: string) {
  const [images, setImages] = useState<PersonSelectImageData[]>(() => cachedImages(slug, category) ?? []);
  const [loading, setLoading] = useState(() => !cachedImages(slug, category));
  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const key = imageCacheKey(slug, category);
    const scheduleRefresh = (delay = IMAGE_CACHE_MAX_AGE_MS) => {
      refreshTimer = setTimeout(() => {
        imageCache.delete(key);
        fetchImages(slug, category).then((nextImages) => {
          if (!active) return;
          setImages(nextImages);
          scheduleRefresh();
        }).catch(() => undefined);
      }, delay);
    };
    const entry = imageCache.get(key);
    const cached = cachedImages(slug, category);
    if (cached && entry) {
      setImages(cached);
      setLoading(false);
      scheduleRefresh(Math.max(1, IMAGE_CACHE_MAX_AGE_MS - (Date.now() - entry.fetchedAt)));
      return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); };
    }
    setLoading(true);
    fetchImages(slug, category)
      .then((nextImages) => { if (active) { setImages(nextImages); scheduleRefresh(); } })
      .catch(() => { if (active) setImages([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); };
  }, [category, slug]);
  return { images, loading };
}
