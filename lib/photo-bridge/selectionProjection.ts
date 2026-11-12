import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import type { BridgeColorLabels } from "@/lib/photo-bridge/labels";
import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";

export function projectBridgeSelectedNames(
  jpgs: readonly BridgeJpgFile[],
  selectedIds: ReadonlySet<string>,
): string[] {
  return jpgs.flatMap((photo) => selectedIds.has(photo.id) ? [photo.name] : []);
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
  return Object.fromEntries(jpgs.map((photo) => [photo.name, ratingsById[photo.id] ?? 0]));
}

export function projectBridgeColorLabelsByName(
  jpgs: readonly BridgeJpgFile[],
  colorLabelsById: Readonly<BridgeColorLabels>,
): Record<string, number> {
  return Object.fromEntries(jpgs.map((photo) => [photo.name, colorLabelsById[photo.id] ?? 0]));
}

export function resolveBridgeSelectedIdsByName(
  jpgs: readonly BridgeJpgFile[],
  selectedNames: readonly string[],
): Set<string> {
  const selectedKeys = new Set(selectedNames.map(normalizePhotoToolFileKey).filter(Boolean));
  return new Set(jpgs.flatMap((photo) => (
    selectedKeys.has(normalizePhotoToolFileKey(photo.name)) ? [photo.id] : []
  )));
}

export function resolveBridgeRatingsByName(
  jpgs: readonly BridgeJpgFile[],
  ratingsByName: Readonly<Record<string, number>>,
): Record<string, number> {
  const normalizedRatings = new Map<string, number>();
  for (const [name, rating] of Object.entries(ratingsByName)) {
    const key = normalizePhotoToolFileKey(name);
    if (key) normalizedRatings.set(key, rating);
  }
  return Object.fromEntries(jpgs.flatMap((photo) => {
    const rating = normalizedRatings.get(normalizePhotoToolFileKey(photo.name));
    return rating ? [[photo.id, rating] as const] : [];
  }));
}
