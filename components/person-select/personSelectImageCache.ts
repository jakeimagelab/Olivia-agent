import type { PersonSelectImageData } from "./usePersonChoiceSync";

export type PersonSelectImageCacheEntry = {
  images: PersonSelectImageData[];
  fetchedAt: number;
  nextCursor: string | null;
};

export const PERSON_SELECT_IMAGE_CACHE_MAX_AGE_MS = 9 * 60_000;

const imageCache = new Map<string, PersonSelectImageCacheEntry>();

export function personSelectImageCacheKey(slug: string, category: string) {
  return `${slug}:${category}`;
}

export function readPersonSelectImageCache(
  slug: string,
  category: string,
  now = Date.now(),
) {
  const cached = imageCache.get(personSelectImageCacheKey(slug, category));
  return cached && now - cached.fetchedAt < PERSON_SELECT_IMAGE_CACHE_MAX_AGE_MS
    ? cached
    : null;
}

export function writePersonSelectImageCache(
  slug: string,
  category: string,
  entry: PersonSelectImageCacheEntry,
) {
  imageCache.set(personSelectImageCacheKey(slug, category), entry);
}

export function clearPersonSelectImageCacheEntries(slug: string) {
  for (const key of imageCache.keys()) {
    if (key.startsWith(`${slug}:`)) imageCache.delete(key);
  }
}

export function resetPersonSelectImageCacheForTests() {
  imageCache.clear();
}
