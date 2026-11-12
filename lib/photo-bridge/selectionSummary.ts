import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  isBridgeColorLabel,
  type BridgeColorLabel,
  type BridgeColorLabels,
} from "@/lib/photo-bridge/labels";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

export type BridgeSelectionCounts = {
  starred: number;
  colored: number;
  selected: number;
  unselected: number;
};

export function createBridgeSelectionSummary({
  jpgs,
  selectedIds,
  ratings,
  colorLabels,
  excludedIds,
  selectionSource,
  adobeSelectedIds,
  manualSelectedIds,
}: {
  jpgs: readonly BridgeJpgFile[];
  selectedIds: ReadonlySet<string>;
  ratings: Readonly<Record<string, number>>;
  colorLabels: Readonly<BridgeColorLabels>;
  excludedIds: ReadonlySet<string>;
  selectionSource: BridgeSelectionSource;
  adobeSelectedIds: ReadonlySet<string>;
  manualSelectedIds: ReadonlySet<string>;
}) {
  const counts: BridgeSelectionCounts = {
    starred: 0,
    colored: 0,
    selected: 0,
    unselected: 0,
  };
  const selectedPhotos: BridgeJpgFile[] = [];
  let adobeSelectedCount = 0;
  let manualSelectedCount = 0;
  let commonSelectedRating: number | null = null;
  let commonSelectedColor: BridgeColorLabel | 0 | null = null;
  let selectedRatingMixed = false;
  let selectedColorMixed = false;
  let allSelectedExcluded = true;

  for (const photo of jpgs) {
    const rating = ratings[photo.id] ?? 0;
    const color = colorLabels[photo.id] ?? 0;
    const hasStar = Boolean(rating);
    const hasColor = isBridgeColorLabel(color);
    if (hasStar) counts.starred += 1;
    if (hasColor) counts.colored += 1;
    if (hasStar || hasColor) counts.selected += 1;
    else counts.unselected += 1;

    if (!selectedIds.has(photo.id)) continue;
    selectedPhotos.push(photo);
    if (selectionSource !== "olivia" && adobeSelectedIds.has(photo.id)) adobeSelectedCount += 1;
    if (selectionSource !== "adobe" && manualSelectedIds.has(photo.id)) manualSelectedCount += 1;
    if (selectedPhotos.length === 1) {
      commonSelectedRating = rating;
      commonSelectedColor = color;
    } else {
      if (commonSelectedRating !== rating) selectedRatingMixed = true;
      if (commonSelectedColor !== color) selectedColorMixed = true;
    }
    if (!excludedIds.has(photo.id)) allSelectedExcluded = false;
  }

  if (!selectedPhotos.length) allSelectedExcluded = false;
  if (selectedRatingMixed) commonSelectedRating = null;
  if (selectedColorMixed) commonSelectedColor = null;

  return {
    selectionCounts: counts,
    labeledCount: counts.selected,
    selectedPhotos,
    adobeSelectedCount,
    manualSelectedCount,
    commonSelectedRating,
    commonSelectedColor,
    selectedRatingMixed,
    selectedColorMixed,
    allSelectedExcluded,
  };
}
