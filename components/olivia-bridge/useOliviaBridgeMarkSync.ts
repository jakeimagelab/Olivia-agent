"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  resolveBridgeColorLabels,
  resolveBridgeRatings,
  type BridgeColorLabels,
  type BridgeRatingEdits,
} from "@/lib/photo-bridge/labels";
import {
  projectBridgeColorLabelsByName,
  projectBridgeRatingsByName,
  resolveBridgeRatingsByName,
} from "@/lib/photo-bridge/selectionProjection";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

function sameRatings(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const entries = Object.entries(left);
  return entries.length === Object.keys(right).length && entries.every(([id, rating]) => right[id] === rating);
}

export function useOliviaBridgeRatingPublisher({
  jpgs,
  selectionSource,
  jpgRatingsByName,
  setJpgRatingsByName,
  setRatings,
  ratingsRef,
  ratingEditsRef,
}: {
  jpgs: readonly BridgeJpgFile[];
  selectionSource: BridgeSelectionSource;
  jpgRatingsByName: Readonly<Record<string, number>>;
  setJpgRatingsByName: (
    entries: Readonly<Record<string, number | null | undefined>>,
    options?: { overwrite?: boolean },
  ) => void;
  setRatings: Dispatch<SetStateAction<Record<string, number>>>;
  ratingsRef: MutableRefObject<Record<string, number>>;
  ratingEditsRef: MutableRefObject<BridgeRatingEdits>;
}) {
  const lastPublishedRatingsRef = useRef<Record<string, number> | null>(null);

  const publishRatingsForSource = useCallback((
    source: BridgeSelectionSource,
    nextAdobe: Record<string, number>,
  ) => {
    const resolved = resolveBridgeRatings(source, ratingsRef.current, nextAdobe, ratingEditsRef.current);
    const byId = Object.fromEntries(jpgs.flatMap((photo) => (
      resolved[photo.id] ? [[photo.id, resolved[photo.id]] as const] : []
    )));
    lastPublishedRatingsRef.current = byId;
    setJpgRatingsByName(projectBridgeRatingsByName(jpgs, resolved), { overwrite: true });
  }, [jpgs, ratingEditsRef, ratingsRef, setJpgRatingsByName]);

  const rememberPublishedRatings = useCallback((ratings: Readonly<Record<string, number>>) => {
    lastPublishedRatingsRef.current = { ...ratings };
  }, []);

  useEffect(() => {
    const next = resolveBridgeRatingsByName(jpgs, jpgRatingsByName);
    const published = lastPublishedRatingsRef.current;
    if (published && sameRatings(published, next)) {
      lastPublishedRatingsRef.current = null;
      return;
    }
    if (selectionSource !== "olivia") return;
    setRatings((current) => sameRatings(current, next) ? current : next);
  }, [jpgRatingsByName, jpgs, selectionSource, setRatings]);

  return {
    publishRatingsForSource,
    rememberPublishedRatings,
  };
}

export function useOliviaBridgeEffectiveMarks({
  jpgs,
  selectionSource,
  ratings,
  adobeRatings,
  ratingEdits,
  colorLabels,
  adobeColorLabels,
  setJpgColorLabelsByName,
}: {
  jpgs: readonly BridgeJpgFile[];
  selectionSource: BridgeSelectionSource;
  ratings: Readonly<Record<string, number>>;
  adobeRatings: Readonly<Record<string, number>>;
  ratingEdits: Readonly<BridgeRatingEdits>;
  colorLabels: Readonly<BridgeColorLabels>;
  adobeColorLabels: Readonly<BridgeColorLabels>;
  setJpgColorLabelsByName: (
    entries: Readonly<Record<string, number | null | undefined>>,
    options?: { overwrite?: boolean },
  ) => void;
}) {
  const effectiveRatings = useMemo(
    () => resolveBridgeRatings(selectionSource, ratings, adobeRatings, ratingEdits),
    [adobeRatings, ratingEdits, ratings, selectionSource],
  );
  const effectiveColorLabels = useMemo(
    () => resolveBridgeColorLabels(selectionSource, colorLabels, adobeColorLabels),
    [adobeColorLabels, colorLabels, selectionSource],
  );

  useEffect(() => {
    setJpgColorLabelsByName(
      projectBridgeColorLabelsByName(jpgs, effectiveColorLabels),
      { overwrite: true },
    );
  }, [effectiveColorLabels, jpgs, setJpgColorLabelsByName]);

  return { effectiveRatings, effectiveColorLabels };
}
