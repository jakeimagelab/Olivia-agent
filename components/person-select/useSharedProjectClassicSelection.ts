"use client";

import { useCallback, useRef, useState } from "react";

import { toggleClassicSelectionId } from "@/lib/person-select/classicSelection";
import {
  applySelectionDiffsToSharedSnapshot,
  type SelectionSyncDiff,
  type SharedSelectionSyncSnapshot,
} from "@/lib/person-select/selectionSync";
import {
  readSelectionJsonResponse,
  sendSelectionSyncBatch,
} from "@/lib/person-select/selectionSyncClient";

import { useSelectionSyncQueue } from "./useSelectionSyncQueue";
import { useSharedCustomerMemoSync } from "./useSharedCustomerMemoSync";
import { useVisibleSelectionRefresh } from "./useVisibleSelectionRefresh";

export function useSharedProjectClassicSelection({
  shareToken,
  eventId,
  reviewerId,
  initialSnapshot,
  onError,
}: {
  shareToken: string;
  eventId: string;
  reviewerId: string;
  initialSnapshot: SharedSelectionSyncSnapshot;
  onError: (message: string) => void;
}) {
  const serverSnapshotRef = useRef(initialSnapshot);
  const [selected, setSelected] = useState(() => new Set(initialSnapshot.selectedImageIds));
  const selectedRef = useRef(selected);

  const replaceSelected = useCallback((next: Set<string>) => {
    selectedRef.current = next;
    setSelected(next);
  }, []);

  const installSnapshot = useCallback((
    snapshot: SharedSelectionSyncSnapshot,
    pending: SelectionSyncDiff[],
  ) => {
    serverSnapshotRef.current = snapshot;
    replaceSelected(new Set(
      applySelectionDiffsToSharedSnapshot(snapshot, pending).selectedImageIds,
    ));
    onError("");
  }, [onError, replaceSelected]);

  const sendBatch = useCallback(async ({
    clientId,
    diffs,
  }: {
    clientId: string;
    diffs: SelectionSyncDiff[];
  }) => sendSelectionSyncBatch<SharedSelectionSyncSnapshot>({
    endpoint: `/api/pick/shared/${shareToken}/draft`,
    clientId,
    diffs,
    responseKey: "draft",
  }), [shareToken]);

  const selectionSync = useSelectionSyncQueue({
    storageKey: `person-select-classic-sync:${eventId}:${reviewerId}`,
    sendBatch,
    onSnapshot: installSnapshot,
    onRestore: (pending) => replaceSelected(new Set(
      applySelectionDiffsToSharedSnapshot(serverSnapshotRef.current, pending).selectedImageIds,
    )),
  });
  const memoSync = useSharedCustomerMemoSync<SharedSelectionSyncSnapshot>({
    storageKey: `person-select-classic-memo:${eventId}:${reviewerId}`,
    endpoint: `/api/pick/shared/${shareToken}/draft`,
    initialValue: initialSnapshot.customerMemo,
    enabled: true,
    onSnapshot: (snapshot) => installSnapshot(snapshot, selectionSync.getPendingDiffs()),
  });
  const getPendingSelectionDiffs = selectionSync.getPendingDiffs;
  const enqueueSelectionSync = selectionSync.enqueue;

  const refreshServerDraft = useCallback(async () => {
    try {
      const response = await fetch(`/api/pick/shared/${shareToken}/draft`, {
        cache: "no-store",
      });
      const result = await readSelectionJsonResponse<{
        ok?: boolean;
        draft?: SharedSelectionSyncSnapshot;
      }>(response);
      if (response.ok && result?.ok && result.draft) {
        installSnapshot(result.draft, getPendingSelectionDiffs());
      }
    } catch {
      // 저장 대기 변경은 유지하고 다음 focus에서 다시 확인한다.
    }
  }, [getPendingSelectionDiffs, installSnapshot, shareToken]);
  useVisibleSelectionRefresh({ refresh: refreshServerDraft });

  const toggle = useCallback((imageId: string) => {
    const update = toggleClassicSelectionId(selectedRef.current, imageId);
    replaceSelected(update.selectedIds);
    enqueueSelectionSync(update.selected
      ? [{ imageId, rating: 5 }]
      : [{ imageId, rating: null }, { imageId, colorLabel: null }]);
  }, [enqueueSelectionSync, replaceSelected]);

  const pendingCount = selectionSync.pendingCount + (memoSync.pending ? 1 : 0);
  const saveState = selectionSync.status === "saved" && memoSync.status === "saved"
    ? "저장됨 · 서버 기준"
    : selectionSync.status === "saving" || memoSync.status === "saving"
      ? "저장 중…"
      : selectionSync.status === "retrying" || memoSync.status === "retrying"
        ? `저장 안 된 변경 ${pendingCount}건 · 잠시 후 자동 저장`
        : `저장 안 된 변경 ${pendingCount}건 · 잠시 후 저장`;

  return {
    selected,
    selectionSync,
    memoSync,
    toggle,
    saveState,
  };
}
