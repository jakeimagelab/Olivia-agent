"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  toggleBridgeColorLabel,
  updateBridgeRatingEdits,
  type BridgeColorLabel,
  type BridgeColorLabels,
  type BridgeRatingEdits,
} from "@/lib/photo-bridge/labels";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

type UseOliviaBridgeSelectionLabelsOptions = {
  jpgs: readonly BridgeJpgFile[];
  selectedIds: ReadonlySet<string>;
  focusedId: string | null;
  selectionSourceRef: MutableRefObject<BridgeSelectionSource>;
  setJpgRatingsByName: (
    entries: Readonly<Record<string, number | null | undefined>>,
    options?: { overwrite?: boolean },
  ) => void;
  showAdobeSelectionNotice: () => void;
};

export function useOliviaBridgeSelectionLabels({
  jpgs,
  selectedIds,
  focusedId,
  selectionSourceRef,
  setJpgRatingsByName,
  showAdobeSelectionNotice,
}: UseOliviaBridgeSelectionLabelsOptions) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [ratingEdits, setRatingEdits] = useState<BridgeRatingEdits>({});
  const [colorLabels, setColorLabels] = useState<BridgeColorLabels>({});
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const ratingsRef = useRef(ratings);
  const ratingEditsRef = useRef(ratingEdits);

  useEffect(() => {
    ratingsRef.current = ratings;
  }, [ratings]);

  useEffect(() => {
    ratingEditsRef.current = ratingEdits;
  }, [ratingEdits]);

  const labelTargets = useCallback((focusedOnly = false) => {
    if (focusedOnly) return focusedId ? new Set([focusedId]) : new Set<string>();
    return selectedIds.size ? new Set(selectedIds) : focusedId ? new Set([focusedId]) : new Set<string>();
  }, [focusedId, selectedIds]);

  const applyRating = useCallback((rating: number, focusedOnly = false) => {
    if (selectionSourceRef.current === "adobe") {
      showAdobeSelectionNotice();
      return;
    }
    const targets = labelTargets(focusedOnly);
    if (!targets.size) return;
    setRatingEdits((previous) => {
      const next = updateBridgeRatingEdits(previous, targets, rating);
      ratingEditsRef.current = next;
      return next;
    });
    setRatings((previous) => {
      const next = { ...previous };
      for (const id of targets) {
        if (rating === 0) delete next[id];
        else next[id] = rating;
      }
      ratingsRef.current = next;
      return next;
    });
    setJpgRatingsByName(
      Object.fromEntries(jpgs.flatMap((photo) => targets.has(photo.id) ? [[photo.name, rating] as const] : [])),
      { overwrite: true },
    );
  }, [jpgs, labelTargets, selectionSourceRef, setJpgRatingsByName, showAdobeSelectionNotice]);

  const applyColorLabel = useCallback((label: BridgeColorLabel, focusedOnly = false) => {
    const targets = labelTargets(focusedOnly);
    if (!targets.size) return;
    setColorLabels((previous) => toggleBridgeColorLabel(previous, targets, label));
  }, [labelTargets]);

  const clearColorLabels = useCallback(() => {
    const targets = labelTargets(false);
    if (!targets.size) return;
    setColorLabels((previous) => {
      const next = { ...previous };
      for (const id of targets) delete next[id];
      return next;
    });
  }, [labelTargets]);

  const toggleExcluded = useCallback((focusedOnly = false) => {
    const targets = labelTargets(focusedOnly);
    if (!targets.size) return;
    setExcludedIds((previous) => {
      const next = new Set(previous);
      const exclude = [...targets].some((id) => !next.has(id));
      for (const id of targets) {
        if (exclude) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, [labelTargets]);

  return {
    ratings,
    setRatings,
    ratingEdits,
    setRatingEdits,
    colorLabels,
    setColorLabels,
    excludedIds,
    setExcludedIds,
    ratingsRef,
    ratingEditsRef,
    applyRating,
    applyColorLabel,
    clearColorLabels,
    toggleExcluded,
  };
}
