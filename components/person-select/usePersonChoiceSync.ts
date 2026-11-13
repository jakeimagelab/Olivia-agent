"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SelectionSyncDiff } from "@/lib/person-select/selectionSync";
import { readSelectionJsonResponse, sendSelectionSyncBatch } from "@/lib/person-select/selectionSyncClient";
import {
  overlayPersonChoiceDiffs,
  personChoiceMap,
  reconcilePersonChoiceMaps,
  type PersonChoiceSyncSnapshot,
  type PersonSelectChoice,
  type PersonSelectImageData,
} from "@/lib/person-select/personChoiceSyncState";
import { useSelectionSyncQueue } from "./useSelectionSyncQueue";
import { useVisibleSelectionRefresh } from "./useVisibleSelectionRefresh";

export type { PersonSelectChoice, PersonSelectImageData } from "@/lib/person-select/personChoiceSyncState";
export { overlayPersonChoiceDiffs, reconcilePersonChoiceMaps } from "@/lib/person-select/personChoiceSyncState";

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
  const [confirmed, setConfirmed] = useState<Map<string, PersonSelectChoice>>(() => personChoiceMap(initialChoices));
  const [displayed, setDisplayed] = useState<Map<string, PersonSelectChoice>>(() => personChoiceMap(initialChoices));
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
    const next = reconcilePersonChoiceMaps(confirmedRef.current, personChoiceMap(initialChoices));
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
