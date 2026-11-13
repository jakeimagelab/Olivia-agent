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
