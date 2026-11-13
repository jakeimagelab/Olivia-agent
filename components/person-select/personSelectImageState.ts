import type { PersonSelectImageData } from "./usePersonChoiceSync";

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

export function mergePersonSelectSeedImages(
  current: PersonSelectImageData[],
  seeds: readonly PersonSelectImageData[],
) {
  if (!seeds.length) return current;
  const currentById = new Map(current.map((image, index) => [image.id, { image, index }]));
  let next: PersonSelectImageData[] | null = null;

  for (const seed of seeds) {
    const entry = currentById.get(seed.id);
    if (!entry) {
      next ??= [...current];
      next.push(seed);
      currentById.set(seed.id, { image: seed, index: next.length - 1 });
      continue;
    }

    const merged = {
      ...entry.image,
      original_file_name: entry.image.original_file_name || seed.original_file_name,
      thumb_url: entry.image.thumb_url || seed.thumb_url,
      preview_url: entry.image.preview_url || seed.preview_url,
    };
    if (
      merged.original_file_name === entry.image.original_file_name
      && merged.thumb_url === entry.image.thumb_url
      && merged.preview_url === entry.image.preview_url
    ) continue;
    next ??= [...current];
    next[entry.index] = merged;
    currentById.set(seed.id, { image: merged, index: entry.index });
  }

  if (!next) return current;
  return next.sort((left, right) => (
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
  return images.map((image) => previewById.has(image.id)
    ? { ...image, preview_url: previewById.get(image.id) ?? image.preview_url }
    : image);
}

export function isPersonSelectImagePageNearEnd(index: number, loadedCount: number, threshold = 12) {
  return loadedCount > 0 && index >= Math.max(0, loadedCount - threshold);
}
