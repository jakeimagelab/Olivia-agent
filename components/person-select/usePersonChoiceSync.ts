"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  compactSelectionSyncDiffs,
  type SelectionSyncDiff,
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
  sort_order?: number;
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

function sameRetouchKeys(left: readonly string[], right: readonly string[]) {
  return left === right || (left.length === right.length && left.every((key, index) => key === right[index]));
}

function samePersonChoice(left: PersonSelectChoice, right: PersonSelectChoice) {
  return left.image_id === right.image_id
    && left.original_file_name === right.original_file_name
    && left.thumb_url === right.thumb_url
    && left.memo === right.memo
    && sameRetouchKeys(left.retouch_keys, right.retouch_keys);
}

export function reconcilePersonChoiceMaps(
  previous: Map<string, PersonSelectChoice>,
  incoming: ReadonlyMap<string, PersonSelectChoice>,
): Map<string, PersonSelectChoice> {
  let changed = previous.size !== incoming.size;
  const next = new Map<string, PersonSelectChoice>();
  for (const [imageId, choice] of incoming) {
    const current = previous.get(imageId);
    if (current && samePersonChoice(current, choice)) next.set(imageId, current);
    else {
      changed = true;
      next.set(imageId, choice);
    }
  }
  return changed ? next : previous;
}

export function overlayPersonChoiceDiffs(
  base: ReadonlyMap<string, PersonSelectChoice>,
  diffs: readonly SelectionSyncDiff[],
  images: readonly PersonSelectImageData[] | ReadonlyMap<string, PersonSelectImageData>,
) {
  const next = new Map(base);
  const imageById = Array.isArray(images)
    ? new Map(images.map((image) => [image.id, image]))
    : images as ReadonlyMap<string, PersonSelectImageData>;
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
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);

  const installSnapshot = useCallback((snapshot: PersonChoiceSyncSnapshot, pending: SelectionSyncDiff[]) => {
    const previous = confirmedRef.current;
    const incoming = new Map<string, PersonSelectChoice>();
    for (const item of snapshot.items ?? []) {
      if (!item.selected || item.categoryKey !== categoryKey) continue;
      const image = imageById.get(item.imageId);
      const old = previous.get(item.imageId);
      if (!image && !old) continue;
      incoming.set(item.imageId, {
        id: old?.id ?? `server-${item.imageId}`,
        image_id: item.imageId,
        original_file_name: image?.original_file_name ?? old?.original_file_name ?? "",
        thumb_url: image?.thumb_url ?? old?.thumb_url ?? null,
        retouch_keys: Array.isArray(item.retouchKeys) ? item.retouchKeys : [],
        memo: typeof item.memo === "string" ? item.memo : "",
        updated_at: item.updatedAt ?? snapshot.updatedAt ?? new Date().toISOString(),
      });
    }
    const next = reconcilePersonChoiceMaps(previous, incoming);
    confirmedRef.current = next;
    setConfirmed((current) => current === next ? current : next);
    setDisplayed((current) => reconcilePersonChoiceMaps(current, overlayPersonChoiceDiffs(next, pending, imageById)));
  }, [categoryKey, imageById]);

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
    onRestore: (pending) => setDisplayed(overlayPersonChoiceDiffs(confirmedRef.current, pending, imageById)),
    onPendingChange: (pending) => setDisplayed(overlayPersonChoiceDiffs(confirmedRef.current, pending, imageById)),
  });
  const getPendingSelectionDiffs = sync.getPendingDiffs;

  useEffect(() => {
    if (sync.pendingCount) return;
    const next = reconcilePersonChoiceMaps(confirmedRef.current, choiceMap(initialChoices));
    confirmedRef.current = next;
    setConfirmed((current) => current === next ? current : next);
    setDisplayed((current) => reconcilePersonChoiceMaps(current, next));
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

  const confirmedChoices = useMemo(() => [...confirmed.values()], [confirmed]);
  const displayedChoices = useMemo(() => [...displayed.values()], [displayed]);

  return {
    ...sync,
    enqueue: sync.enqueue,
    confirmedChoices,
    displayedChoices,
  };
}
