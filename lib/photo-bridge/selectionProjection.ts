import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import type { BridgeColorLabels } from "@/lib/photo-bridge/labels";
import {
  normalizePhotoToolFileKey,
  normalizePhotoToolSelectionKey,
} from "@/lib/photo-bridge/toolLinkage";

function photoSelectionName(photo: BridgeJpgFile): string {
  return photo.relativePath || photo.name;
}

export function projectBridgeSelectedNames(
  jpgs: readonly BridgeJpgFile[],
  selectedIds: ReadonlySet<string>,
): string[] {
  return jpgs.flatMap((photo) => selectedIds.has(photo.id) ? [photoSelectionName(photo)] : []);
}

export function projectBridgeSelectedFiles(
  jpgs: readonly BridgeJpgFile[],
  selectedIds: ReadonlySet<string>,
): File[] {
  return jpgs.flatMap((photo) => selectedIds.has(photo.id) && photo.file ? [photo.file] : []);
}

export function projectBridgeRatingsByName(
  jpgs: readonly BridgeJpgFile[],
  ratingsById: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(jpgs.map((photo) => [photoSelectionName(photo), ratingsById[photo.id] ?? 0]));
}

export function projectBridgeColorLabelsByName(
  jpgs: readonly BridgeJpgFile[],
  colorLabelsById: Readonly<BridgeColorLabels>,
): Record<string, number> {
  return Object.fromEntries(jpgs.map((photo) => [photoSelectionName(photo), colorLabelsById[photo.id] ?? 0]));
}

export function resolveBridgeSelectedIdsByName(
  jpgs: readonly BridgeJpgFile[],
  selectedNames: readonly string[],
): Set<string> {
  const exactKeys = new Set(selectedNames
    .filter((name) => /[\\/]/u.test(name))
    .map(normalizePhotoToolSelectionKey)
    .filter(Boolean));
  const legacyBasenames = new Set(selectedNames
    .filter((name) => !/[\\/]/u.test(name))
    .map(normalizePhotoToolFileKey)
    .filter(Boolean));
  return new Set(jpgs.flatMap((photo) => (
    exactKeys.has(normalizePhotoToolSelectionKey(photoSelectionName(photo)))
      || legacyBasenames.has(normalizePhotoToolFileKey(photo.name))
      ? [photo.id]
      : []
  )));
}

export function resolveBridgeRatingsByName(
  jpgs: readonly BridgeJpgFile[],
  ratingsByName: Readonly<Record<string, number>>,
): Record<string, number> {
  const exactRatings = new Map<string, number>();
  const legacyRatings = new Map<string, number>();
  for (const [name, rating] of Object.entries(ratingsByName)) {
    const key = normalizePhotoToolSelectionKey(name);
    if (!key) continue;
    if (/[\\/]/u.test(name)) exactRatings.set(key, rating);
    else legacyRatings.set(normalizePhotoToolFileKey(name), rating);
  }
  return Object.fromEntries(jpgs.flatMap((photo) => {
    const rating = exactRatings.get(normalizePhotoToolSelectionKey(photoSelectionName(photo)))
      ?? legacyRatings.get(normalizePhotoToolFileKey(photo.name));
    return rating ? [[photo.id, rating] as const] : [];
  }));
}
