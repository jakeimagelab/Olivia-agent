"use client";

import { useCallback, useMemo } from "react";

import {
  buildClassicChoiceFeedbackPatches,
  buildClassicChoiceSelectionPatches,
} from "@/lib/person-select/classicChoicePatches";

import type { PersonSelectCategoryData } from "./personSelectPublicModel";
import { usePersonChoiceSync, type PersonSelectImageData } from "./usePersonChoiceSync";

export function usePersonSelectPcChoices({
  slug,
  active,
  images,
  limit,
  locked,
}: {
  slug: string;
  active: PersonSelectCategoryData | undefined;
  images: readonly PersonSelectImageData[];
  limit: number;
  locked: boolean;
}) {
  const sync = usePersonChoiceSync({
    slug,
    categoryKey: active?.key ?? "profile",
    initialChoices: active?.choices ?? [],
    images,
    enabled: Boolean(active && !locked),
  });
  const displayedChoices = sync.displayedChoices;
  const chosenIds = useMemo(
    () => new Set(displayedChoices.map((choice) => choice.image_id)),
    [displayedChoices],
  );
  const choiceByImageId = useMemo(
    () => new Map(displayedChoices.map((choice) => [choice.image_id, choice])),
    [displayedChoices],
  );
  const imageIds = useMemo(() => new Set(images.map((image) => image.id)), [images]);
  const full = limit > 1 && displayedChoices.length >= limit;
  const enqueue = sync.enqueue;

  const chooseImage = useCallback((
    imageId: string,
    retouchKeys: string[] = [],
    memo = "",
  ) => {
    if (!active || !imageIds.has(imageId)) return false;
    const { patches, limitReached } = buildClassicChoiceSelectionPatches({
      imageId,
      selectedIds: chosenIds,
      limit,
      retouchKeys,
      memo,
    });
    if (limitReached) return false;
    enqueue(patches);
    return true;
  }, [active, chosenIds, enqueue, imageIds, limit]);

  const clearChoice = useCallback((imageId: string) => {
    if (!active) return;
    enqueue([{ imageId, selected: false }]);
  }, [active, enqueue]);

  const updateFeedback = useCallback((
    imageId: string,
    retouchKeys: string[],
    memo: string,
  ) => {
    enqueue(buildClassicChoiceFeedbackPatches(imageId, retouchKeys, memo));
  }, [enqueue]);

  return {
    sync,
    displayedChoices,
    chosenIds,
    choiceByImageId,
    full,
    chooseImage,
    clearChoice,
    updateFeedback,
  };
}
