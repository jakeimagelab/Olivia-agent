export type SelectionMediaVariant = "thumbnail" | "preview" | "both";

export const SELECTION_THUMBNAIL_PAGE_SIZE = 72;
export const SELECTION_MEDIA_URL_CACHE_LIMIT = 240;

export type SelectionMediaUrls = {
  image_url?: string;
  thumbnail_url?: string | null;
};

export type SelectionMediaUrlCache = {
  records: Record<string, SelectionMediaUrls>;
  order: string[];
};

export type ResolvedSelectionMediaEntry<T> = {
  source: T;
  urls: SelectionMediaUrls;
  value: T;
};

export function reconcileSelectionMediaImages<
  T extends { id: string; image_url?: string; thumbnail_url?: string | null },
>(
  sourceImages: readonly T[],
  records: Readonly<Record<string, SelectionMediaUrls>>,
  previous: ReadonlyMap<string, ResolvedSelectionMediaEntry<T>> = new Map(),
) {
  const entries = new Map<string, ResolvedSelectionMediaEntry<T>>();
  const images = sourceImages.map((source) => {
    const urls = records[source.id];
    if (!urls) return source;
    const cached = previous.get(source.id);
    if (cached?.source === source && cached.urls === urls) {
      entries.set(source.id, cached);
      return cached.value;
    }
    const entry = { source, urls, value: { ...source, ...urls } };
    entries.set(source.id, entry);
    return entry.value;
  });
  return { images, entries };
}

export function mergeSelectionMediaUrlRecords(
  current: Record<string, SelectionMediaUrls>,
  updates: Record<string, SelectionMediaUrls>,
) {
  const next = { ...current };
  for (const [imageId, urls] of Object.entries(updates)) {
    next[imageId] = { ...(current[imageId] ?? {}), ...urls };
  }
  return next;
}

export function mergeSelectionMediaUrlCache(
  current: SelectionMediaUrlCache,
  updates: Record<string, SelectionMediaUrls>,
  limit = SELECTION_MEDIA_URL_CACHE_LIMIT,
): SelectionMediaUrlCache {
  const updateIds = Object.keys(updates);
  if (!updateIds.length) return current;
  const touched = new Set(updateIds);
  const order = [...current.order.filter((imageId) => !touched.has(imageId)), ...updateIds];
  const records = mergeSelectionMediaUrlRecords(current.records, updates);
  const boundedLimit = Math.max(1, limit);
  while (order.length > boundedLimit) {
    const evictedId = order.shift();
    if (evictedId) delete records[evictedId];
  }
  return { records, order };
}

export function adjacentSelectionMediaIds<T extends { id: string }>(
  images: readonly T[],
  activeId: string | null,
  radius = 2,
) {
  if (!activeId) return [];
  const index = images.findIndex((image) => image.id === activeId);
  if (index < 0) return [];
  const ids: string[] = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    const image = images[index + offset];
    if (image) ids.push(image.id);
  }
  return ids;
}
