"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parsePersistedSelectionSyncQueue,
  type SelectionSyncDiff,
  type SelectionSyncPatch,
} from "@/lib/person-select/selectionSync";
import { readSelectionSyncStorageValue } from "@/lib/person-select/selectionSyncPersistence";
import {
  initialSelectionSyncQueueState,
  SelectionSyncQueueRuntime,
  type SelectionSyncQueueStatus,
} from "@/lib/person-select/selectionSyncQueueRuntime";
import { useSelectionSyncBrowserPersistence } from "@/components/person-select/useSelectionSyncBrowserPersistence";

export { SelectionSyncRequestError } from "@/lib/person-select/selectionSyncClient";
export { SELECTION_SYNC_STORAGE_EVENT } from "@/components/person-select/useSelectionSyncBrowserPersistence";
export type { SelectionSyncQueueStatus };

type SelectionSyncQueueOptions<TSnapshot> = {
  storageKey: string;
  enabled?: boolean;
  sendBatch: (input: { clientId: string; diffs: SelectionSyncDiff[] }) => Promise<TSnapshot>;
  onSnapshot: (snapshot: TSnapshot, pending: SelectionSyncDiff[]) => void;
  onRestore?: (pending: SelectionSyncDiff[]) => void;
  onPendingChange?: (pending: SelectionSyncDiff[]) => void;
};

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `olivia_${crypto.randomUUID()}`;
  return `olivia_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function useSelectionSyncQueue<TSnapshot>({
  storageKey,
  enabled = true,
  sendBatch,
  onSnapshot,
  onRestore,
  onPendingChange,
}: SelectionSyncQueueOptions<TSnapshot>) {
  const [state, setState] = useState(initialSelectionSyncQueueState);
  const { schedulePersistence, flushPersistence } = useSelectionSyncBrowserPersistence();
  const runtimeRef = useRef<SelectionSyncQueueRuntime<TSnapshot> | null>(null);

  if (!runtimeRef.current) {
    runtimeRef.current = new SelectionSyncQueueRuntime<TSnapshot>({
      enabled,
      sendBatch,
      onSnapshot,
      onRestore,
      onPendingChange,
      persist: (payload) => schedulePersistence(storageKey, payload),
      flushPersistence,
      createClientId,
      scheduleTask: (task, delay) => window.setTimeout(task, delay),
      cancelTask: (handle) => window.clearTimeout(handle as number),
      onStateChange: setState,
    });
  }
  const runtime = runtimeRef.current;
  runtime.configure({
    enabled,
    sendBatch,
    onSnapshot,
    onRestore,
    onPendingChange,
    persist: (payload) => schedulePersistence(storageKey, payload),
    flushPersistence,
  });

  const enqueue = useCallback((patches: readonly SelectionSyncPatch[]) => {
    runtimeRef.current?.enqueue(patches);
  }, []);
  const flushNow = useCallback(() => runtimeRef.current?.flushNow() ?? Promise.resolve(true), []);
  const retry = useCallback(() => runtimeRef.current?.retry(), []);
  const getPendingDiffs = useCallback(() => runtimeRef.current?.getPendingDiffs() ?? [], []);

  useEffect(() => {
    flushPersistence();
    const stored = readSelectionSyncStorageValue(localStorage, storageKey);
    runtime.reset(parsePersistedSelectionSyncQueue(stored));
    return () => runtime.clearScheduledFlush();
  }, [flushPersistence, runtime, storageKey]);

  useEffect(() => {
    if (!state.pendingCount) return;
    const warn = (event: BeforeUnloadEvent) => {
      flushPersistence();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flushPersistence, state.pendingCount]);

  useEffect(() => () => { flushPersistence(); }, [flushPersistence]);

  return useMemo(() => ({
    enqueue,
    flushNow,
    retry,
    getPendingDiffs,
    status: state.status,
    pendingCount: state.pendingCount,
    pendingImageIds: state.pendingImageIds,
    lastSavedAt: state.lastSavedAt,
    message: state.message,
  }), [enqueue, flushNow, getPendingDiffs, retry, state]);
}
