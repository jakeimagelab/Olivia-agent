export type SelectionMediaVariant = "thumbnail" | "preview" | "both";

export type SelectionMediaUrls = {
  image_url?: string;
  thumbnail_url?: string | null;
};

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
