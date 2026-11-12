"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  compactSelectionSyncDiffs,
  type SelectionSyncDiff,
  type SelectionSyncPatch,
} from "@/lib/person-select/selectionSync";
import { readSelectionJsonResponse, sendSelectionSyncBatch } from "@/lib/person-select/selectionSyncClient";
import { useSelectionSyncQueue } from "./useSelectionSyncQueue";
import { useVisibleSelectionRefresh } from "./useVisibleSelectionRefresh";

export type PersonSelectChoice = {
  id: string;
  image_id: string;
  original_file_name: string;
  thumb_url: string | null;
  retouch_keys: string[];
  memo: string;
  updated_at: string;
};

export type PersonSelectImageData = {
  id: string;
  original_file_name: string;
  thumb_url: string;
  preview_url: string;
  width: number | null;
  height: number | null;
};

type PersonChoiceSyncSnapshot = {
  items: Array<{
    imageId: string;
    categoryKey: string;
    selected: boolean;
    memo?: string;
    retouchKeys?: string[];
    updatedAt?: string;
  }>;
  updatedAt?: string | null;
};

function choiceMap(choices: readonly PersonSelectChoice[]) {
  return new Map(choices.map((choice) => [choice.image_id, choice]));
}

export function overlayPersonChoiceDiffs(
  base: ReadonlyMap<string, PersonSelectChoice>,
  diffs: readonly SelectionSyncDiff[],
  images: readonly PersonSelectImageData[],
) {
  const next = new Map(base);
  const imageById = new Map(images.map((image) => [image.id, image]));
  for (const diff of compactSelectionSyncDiffs(diffs)) {
    const image = imageById.get(diff.imageId);
    if (!image) continue;
    const current = next.get(diff.imageId);
    if (Object.prototype.hasOwnProperty.call(diff, "selected")) {
      if (!diff.selected) {
        next.delete(diff.imageId);
        continue;
      }
      if (!current) next.set(diff.imageId, {
        id: `pending-${diff.imageId}`,
        image_id: diff.imageId,
        original_file_name: image.original_file_name,
        thumb_url: image.thumb_url,
        retouch_keys: [],
        memo: "",
        updated_at: diff.changedAt,
      });
    }
    const choice = next.get(diff.imageId);
    if (!choice) continue;
    if (Object.prototype.hasOwnProperty.call(diff, "memo")) {
      next.set(diff.imageId, { ...choice, memo: diff.memo ?? "", updated_at: diff.changedAt });
    }
    if (Object.prototype.hasOwnProperty.call(diff, "retouchKeys")) {
      next.set(diff.imageId, { ...choice, retouch_keys: diff.retouchKeys ?? [], updated_at: diff.changedAt });
    }
  }
  return next;
}

export function usePersonChoiceSync({
  slug,
  categoryKey,
  initialChoices,
  images,
  enabled,
}: {
  slug: string;
  categoryKey: string;
  initialChoices: readonly PersonSelectChoice[];
  images: readonly PersonSelectImageData[];
  enabled: boolean;
}) {
  const [confirmed, setConfirmed] = useState<Map<string, PersonSelectChoice>>(() => choiceMap(initialChoices));
  const [displayed, setDisplayed] = useState<Map<string, PersonSelectChoice>>(() => choiceMap(initialChoices));
  const confirmedRef = useRef(confirmed);

  const installSnapshot = useCallback((snapshot: PersonChoiceSyncSnapshot, pending: SelectionSyncDiff[]) => {
    const previous = confirmedRef.current;
    const imageById = new Map(images.map((image) => [image.id, image]));
    const next = new Map<string, PersonSelectChoice>();
    for (const item of snapshot.items ?? []) {
      if (!item.selected || item.categoryKey !== categoryKey) continue;
      const image = imageById.get(item.imageId);
      const old = previous.get(item.imageId);
      if (!image && !old) continue;
      next.set(item.imageId, {
        id: old?.id ?? `server-${item.imageId}`,
        image_id: item.imageId,
        original_file_name: image?.original_file_name ?? old?.original_file_name ?? "",
        thumb_url: image?.thumb_url ?? old?.thumb_url ?? null,
        retouch_keys: Array.isArray(item.retouchKeys) ? item.retouchKeys : [],
        memo: typeof item.memo === "string" ? item.memo : "",
        updated_at: item.updatedAt ?? snapshot.updatedAt ?? new Date().toISOString(),
      });
    }
    confirmedRef.current = next;
    setConfirmed(next);
    setDisplayed(overlayPersonChoiceDiffs(next, pending, images));
  }, [categoryKey, images]);

  const sendBatch = useCallback(async ({ clientId, diffs }: { clientId: string; diffs: SelectionSyncDiff[] }) => {
    return sendSelectionSyncBatch<PersonChoiceSyncSnapshot>({
      endpoint: `/api/pick/${slug}/choices/batch`,
      clientId,
      diffs,
      responseKey: "snapshot",
    });
  }, [slug]);

  const sync = useSelectionSyncQueue({
    storageKey: `person-select-choice-sync:${slug}:${categoryKey}`,
    enabled,
    sendBatch,
    onSnapshot: installSnapshot,
    onRestore: (pending) => setDisplayed(overlayPersonChoiceDiffs(confirmedRef.current, pending, images)),
    onPendingChange: (pending) => setDisplayed(overlayPersonChoiceDiffs(confirmedRef.current, pending, images)),
  });
  const getPendingSelectionDiffs = sync.getPendingDiffs;

  useEffect(() => {
    if (sync.pendingCount) return;
    const next = choiceMap(initialChoices);
    confirmedRef.current = next;
    setConfirmed(next);
    setDisplayed(next);
  }, [initialChoices, sync.pendingCount]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const response = await fetch(`/api/pick/${slug}/choices/batch`, { cache: "no-store" });
    const result = await readSelectionJsonResponse<{ ok?: boolean; snapshot?: PersonChoiceSyncSnapshot }>(response);
    if (response.ok && result?.ok && result.snapshot) {
      installSnapshot(result.snapshot as PersonChoiceSyncSnapshot, getPendingSelectionDiffs());
    }
  }, [enabled, getPendingSelectionDiffs, installSnapshot, slug]);

  useVisibleSelectionRefresh({ enabled, refresh });

  return {
    ...sync,
    enqueue: (patches: readonly SelectionSyncPatch[]) => sync.enqueue(patches),
    confirmedChoices: [...confirmed.values()],
    displayedChoices: [...displayed.values()],
  };
}
