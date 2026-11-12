"use client";

import { useMemo } from "react";

import type {
  BridgeWorkspaceFileFilter,
  BridgeWorkspaceQualityFilter,
} from "@/components/olivia-bridge/OliviaBridgeFolderPanel";
import {
  sortBridgeJpgs,
  type BridgeFolderScan,
  type BridgeJpgSortMode,
} from "@/lib/photo-bridge/bridgeFiles";
import {
  bridgeFilenameSearchTokens,
  hasActiveBridgeLabelFilters,
  matchesBridgeFilenameSearch,
  matchesBridgeLabelFilters,
  matchesBridgeSelectionView,
  type BridgeColorLabels,
  type BridgeLabelFilters,
} from "@/lib/photo-bridge/labels";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import {
  customerSelectionComparisonCounts,
  matchesCustomerSelectionComparison,
  type CustomerSelectionComparisonFilter,
} from "@/lib/select-gallery/customerBridge";

type UseOliviaBridgeVisibleFilesOptions = {
  scan: BridgeFolderScan;
  jpgSortMode: BridgeJpgSortMode;
  fileFilter: BridgeWorkspaceFileFilter;
  labelFilters: BridgeLabelFilters;
  filenameSearch: string;
  effectiveRatings: Readonly<Record<string, number>>;
  effectiveColorLabels: Readonly<BridgeColorLabels>;
  excludedIds: ReadonlySet<string>;
  qualityByBridgeId: Readonly<Record<string, PublicPhotoQualityResult>>;
  qualityFilter: BridgeWorkspaceQualityFilter;
  comparisonFilter: CustomerSelectionComparisonFilter;
  selectedIds: ReadonlySet<string>;
  customerSelectedIds: ReadonlySet<string>;
  focusedId: string | null;
  focusedPlainId: string | null;
};

export function useOliviaBridgeVisibleFiles({
  scan,
  jpgSortMode,
  fileFilter,
  labelFilters,
  filenameSearch,
  effectiveRatings,
  effectiveColorLabels,
  excludedIds,
  qualityByBridgeId,
  qualityFilter,
  comparisonFilter,
  selectedIds,
  customerSelectedIds,
  focusedId,
  focusedPlainId,
}: UseOliviaBridgeVisibleFilesOptions) {
  const filenameSearchTokens = useMemo(
    () => bridgeFilenameSearchTokens(filenameSearch),
    [filenameSearch],
  );
  const hasLabelFilters = hasActiveBridgeLabelFilters(labelFilters);
  const visibleJpgs = useMemo(() => sortBridgeJpgs(scan.jpgs.filter((photo) => {
    const passesFileFilter = hasLabelFilters
      ? matchesBridgeLabelFilters(photo.id, labelFilters, effectiveRatings, effectiveColorLabels)
      : fileFilter === "raw" || fileFilter === "sidecar"
        ? false
        : fileFilter === "starred" || fileFilter === "colored" || fileFilter === "selected" || fileFilter === "unselected"
          ? matchesBridgeSelectionView(photo.id, fileFilter, effectiveRatings, effectiveColorLabels)
          : fileFilter === "excluded"
            ? excludedIds.has(photo.id)
            : true;
    if (!passesFileFilter || !matchesBridgeFilenameSearch(photo.name, filenameSearchTokens)) return false;
    const quality = qualityByBridgeId[photo.id];
    if (qualityFilter === "eyes_closed" || qualityFilter === "face_too_dark" || qualityFilter === "motion_blur") {
      if (!quality?.flags.includes(qualityFilter)) return false;
    } else if (qualityFilter === "needs_review" && quality?.status !== "needs_review") return false;
    else if (qualityFilter === "normal" && quality?.status !== "normal" && quality?.reviewStatus !== "confirmed_normal") return false;
    return matchesCustomerSelectionComparison({
      id: photo.id,
      filter: comparisonFilter,
      adminIds: selectedIds,
      customerIds: customerSelectedIds,
    });
  }), jpgSortMode), [comparisonFilter, customerSelectedIds, effectiveColorLabels, effectiveRatings, excludedIds, fileFilter, filenameSearchTokens, hasLabelFilters, jpgSortMode, labelFilters, qualityByBridgeId, qualityFilter, scan.jpgs, selectedIds]);

  const visiblePhotoById = useMemo(
    () => new Map(visibleJpgs.map((photo) => [photo.id, photo] as const)),
    [visibleJpgs],
  );
  const comparisonCounts = useMemo(
    () => customerSelectionComparisonCounts(scan.jpgs.map((photo) => photo.id), selectedIds, customerSelectedIds),
    [customerSelectedIds, scan.jpgs, selectedIds],
  );
  const qualityCounts = useMemo(() => scan.jpgs.reduce((counts, photo) => {
    const quality = qualityByBridgeId[photo.id];
    if (!quality) return counts;
    for (const flag of quality.flags) counts[flag] += 1;
    if (quality.status === "needs_review") counts.needs_review += 1;
    if (quality.status === "normal" || quality.reviewStatus === "confirmed_normal") counts.normal += 1;
    return counts;
  }, { eyes_closed: 0, face_too_dark: 0, motion_blur: 0, needs_review: 0, normal: 0 }), [qualityByBridgeId, scan.jpgs]);
  const showRaws = comparisonFilter === "all"
    && !hasLabelFilters
    && !filenameSearchTokens.length
    && (fileFilter === "all" || fileFilter === "raw");
  const showSidecars = comparisonFilter === "all"
    && !hasLabelFilters
    && !filenameSearchTokens.length
    && (fileFilter === "all" || fileFilter === "sidecar");
  const focusedIndex = useMemo(
    () => visibleJpgs.findIndex((photo) => photo.id === focusedId),
    [focusedId, visibleJpgs],
  );
  const focusedPhoto = focusedId ? visiblePhotoById.get(focusedId) ?? null : null;
  const visiblePlainFiles = useMemo(() => [
    ...(showRaws ? scan.raws : []),
    ...(showSidecars ? scan.sidecars : []),
  ], [scan.raws, scan.sidecars, showRaws, showSidecars]);
  const focusedPlainFile = focusedPlainId
    ? visiblePlainFiles.find((file) => file.id === focusedPlainId) ?? null
    : null;

  return {
    filenameSearchTokens,
    hasLabelFilters,
    visibleJpgs,
    visiblePhotoById,
    comparisonCounts,
    qualityCounts,
    showRaws,
    showSidecars,
    focusedIndex,
    focusedPhoto,
    visiblePlainFiles,
    focusedPlainFile,
  };
}
