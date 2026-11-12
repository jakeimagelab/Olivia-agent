import {
  bridgeFilenameSearchTokens,
  hasActiveBridgeLabelFilters,
  matchesBridgeFilenameSearch,
  matchesBridgeLabelFilters,
  type BridgeColorLabels,
  type BridgeLabelFilters,
} from "@/lib/photo-bridge/labels";
import type { PhotoQualityFlag, PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import type { CustomerBridgeImage } from "./customerBridgeTypes";

export type CustomerBridgePhotoFilter =
  | "all"
  | "selected"
  | "unselected"
  | PhotoQualityFlag
  | "quality_review"
  | "quality_normal";

export type CustomerBridgeQualityCounts = {
  eyes_closed: number;
  face_too_dark: number;
  motion_blur: number;
  quality_review: number;
  quality_normal: number;
};

export function buildCustomerBridgePhotoView({
  images,
  filter,
  filenameSearch,
  labelFilters,
  selectedIds,
  ratings,
  colorLabels,
  qualityResults,
}: {
  images: readonly CustomerBridgeImage[];
  filter: CustomerBridgePhotoFilter;
  filenameSearch: string;
  labelFilters: BridgeLabelFilters;
  selectedIds: ReadonlySet<string>;
  ratings: Readonly<Record<string, number>>;
  colorLabels: Readonly<BridgeColorLabels>;
  qualityResults: Readonly<Record<string, PublicPhotoQualityResult>>;
}) {
  const searchTokens = bridgeFilenameSearchTokens(filenameSearch);
  const hasLabelFilters = hasActiveBridgeLabelFilters(labelFilters);
  const visibleImages: CustomerBridgeImage[] = [];
  const qualityCounts: CustomerBridgeQualityCounts = {
    eyes_closed: 0,
    face_too_dark: 0,
    motion_blur: 0,
    quality_review: 0,
    quality_normal: 0,
  };
  let selectedInFolder = 0;

  for (const image of images) {
    const selected = selectedIds.has(image.id);
    if (selected) selectedInFolder += 1;
    const quality = qualityResults[image.id];
    if (quality) {
      for (const flag of quality.flags) qualityCounts[flag] += 1;
      if (quality.status === "needs_review") qualityCounts.quality_review += 1;
      if (quality.status === "normal" || quality.reviewStatus === "confirmed_normal") qualityCounts.quality_normal += 1;
    }

    if (filter === "selected" && !selected) continue;
    if (filter === "unselected" && selected) continue;
    if ((filter === "eyes_closed" || filter === "face_too_dark" || filter === "motion_blur") && !(quality?.flags.includes(filter) ?? false)) continue;
    if (filter === "quality_review" && quality?.status !== "needs_review") continue;
    if (filter === "quality_normal" && quality?.status !== "normal" && quality?.reviewStatus !== "confirmed_normal") continue;
    if (hasLabelFilters && !matchesBridgeLabelFilters(image.id, labelFilters, ratings, colorLabels)) continue;
    if (!matchesBridgeFilenameSearch(image.original_file_name, searchTokens)) continue;
    visibleImages.push(image);
  }

  return { visibleImages, selectedInFolder, qualityCounts, searchActive: searchTokens.length > 0 };
}
