"use client";

import { useMemo } from "react";

import type { BridgeWorkspaceFileFilter } from "@/components/olivia-bridge/OliviaBridgeFolderPanel";
import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  bridgeLabelFilterName,
  type BridgeColorLabels,
  type BridgeLabelFilters,
} from "@/lib/photo-bridge/labels";
import { createBridgeSelectionSummary } from "@/lib/photo-bridge/selectionSummary";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

export function useOliviaBridgeSelectionSummary({
  jpgs,
  rawCount,
  sidecarCount,
  selectedIds,
  ratings,
  colorLabels,
  excludedIds,
  selectionSource,
  adobeSelectedIds,
  manualSelectedIds,
  labelFilters,
}: {
  jpgs: readonly BridgeJpgFile[];
  rawCount: number;
  sidecarCount: number;
  selectedIds: ReadonlySet<string>;
  ratings: Readonly<Record<string, number>>;
  colorLabels: Readonly<BridgeColorLabels>;
  excludedIds: ReadonlySet<string>;
  selectionSource: BridgeSelectionSource;
  adobeSelectedIds: ReadonlySet<string>;
  manualSelectedIds: ReadonlySet<string>;
  labelFilters: BridgeLabelFilters;
}) {
  const selectedNames = useMemo(
    () => jpgs.flatMap((photo) => selectedIds.has(photo.id) ? [photo.name] : []),
    [jpgs, selectedIds],
  );
  const summary = useMemo(() => createBridgeSelectionSummary({
    jpgs,
    selectedIds,
    ratings,
    colorLabels,
    excludedIds,
    selectionSource,
    adobeSelectedIds,
    manualSelectedIds,
  }), [adobeSelectedIds, colorLabels, excludedIds, jpgs, manualSelectedIds, ratings, selectedIds, selectionSource]);

  const fileFilters = useMemo<Array<{ key: BridgeWorkspaceFileFilter; label: string; count: number }>>(() => [
    { key: "all", label: "모든 파일", count: jpgs.length + rawCount + sidecarCount },
    { key: "jpg", label: "JPG", count: jpgs.length },
    { key: "raw", label: "RAW", count: rawCount },
    { key: "sidecar", label: "사이드카", count: sidecarCount },
    { key: "excluded", label: "제외", count: excludedIds.size },
  ], [excludedIds.size, jpgs.length, rawCount, sidecarCount]);

  const selectionFilters = useMemo<Array<{ key: BridgeWorkspaceFileFilter; label: string; count: number }>>(() => [
    { key: "starred", label: "별 셀렉 사진만 보기", count: summary.selectionCounts.starred },
    { key: "colored", label: "컬러 셀렉 사진만 보기", count: summary.selectionCounts.colored },
    { key: "selected", label: "모든 셀렉 사진만 보기", count: summary.labeledCount },
    { key: "unselected", label: "셀렉 사진 제외하고 보기", count: summary.selectionCounts.unselected },
  ], [summary.labeledCount, summary.selectionCounts.colored, summary.selectionCounts.starred, summary.selectionCounts.unselected]);

  const activeRatingFilterName = labelFilters.rating === null
    ? null
    : bridgeLabelFilterName({ kind: "rating", rating: labelFilters.rating });
  const activeColorFilterName = labelFilters.color === null
    ? null
    : bridgeLabelFilterName({ kind: "color", label: labelFilters.color });

  return {
    ...summary,
    selectedNames,
    fileFilters,
    selectionFilters,
    activeRatingFilterName,
    activeColorFilterName,
  };
}
