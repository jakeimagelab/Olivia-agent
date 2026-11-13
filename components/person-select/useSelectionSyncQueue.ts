"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  compactSelectionSyncDiffs,
  parsePersistedSelectionSyncQueue,
  pendingSelectionImageIds,
  selectionSyncDiffKey,
  selectionSyncRetryDelay,
  SELECTION_SYNC_BATCH_LIMIT,
  SELECTION_SYNC_DEBOUNCE_MS,
  splitSelectionSyncPatches,
  type PersistedSelectionSyncQueue,
  type SelectionSyncDiff,
  type SelectionSyncPatch,
} from "@/lib/person-select/selectionSync";
import { SelectionSyncRequestError } from "@/lib/person-select/selectionSyncClient";
import { createSelectionSyncPersistenceBuffer } from "@/lib/person-select/selectionSyncPersistence";

export { SelectionSyncRequestError } from "@/lib/person-select/selectionSyncClient";

export type SelectionSyncQueueStatus = "saved" | "waiting" | "saving" | "retrying" | "error";
export const SELECTION_SYNC_STORAGE_EVENT = "olivia-selection-sync-storage";

type SelectionSyncQueueOptions<TSnapshot> = {
  storageKey: string;
  enabled?: boolean;
  sendBatch: (input: { clientId: string; diffs: SelectionSyncDiff[] }) => Promise<TSnapshot>;
  onSnapshot: (snapshot: TSnapshot, pending: SelectionSyncDiff[]) => void;
  onRestore?: (pending: SelectionSyncDiff[]) => void;
  onPendingChange?: (pending: SelectionSyncDiff[]) => void;
};

type PersistRequest = {
  storageKey: string;
  payload: PersistedSelectionSyncQueue;
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
  const [status, setStatus] = useState<SelectionSyncQueueStatus>("saved");
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingImageIds, setPendingImageIds] = useState<Set<string>>(() => new Set());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const queueRef = useRef(new Map<string, SelectionSyncDiff>());
  const clientIdRef = useRef(createClientId());
  const nextSeqRef = useRef(1);
  const lastSavedAtRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const retryAttemptRef = useRef(0);
  const sendBatchRef = useRef(sendBatch);
  const onSnapshotRef = useRef(onSnapshot);
  const onRestoreRef = useRef(onRestore);
  const onPendingChangeRef = useRef(onPendingChange);
  const persistenceRef = useRef<ReturnType<typeof createSelectionSyncPersistenceBuffer<PersistRequest>> | null>(null);

  if (!persistenceRef.current) {
    persistenceRef.current = createSelectionSyncPersistenceBuffer<PersistRequest>({
      write: ({ storageKey: targetStorageKey, payload }) => {
        localStorage.setItem(targetStorageKey, JSON.stringify(payload));
        window.dispatchEvent(new CustomEvent(SELECTION_SYNC_STORAGE_EVENT, { detail: { storageKey: targetStorageKey } }));
      },
      scheduleTask: (task) => {
        const timer = window.setTimeout(task, 0);
        return () => window.clearTimeout(timer);
      },
    });
  }

  useEffect(() => { sendBatchRef.current = sendBatch; }, [sendBatch]);
  useEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);
  useEffect(() => { onRestoreRef.current = onRestore; }, [onRestore]);
  useEffect(() => { onPendingChangeRef.current = onPendingChange; }, [onPendingChange]);

  const queueValues = useCallback(() => compactSelectionSyncDiffs([...queueRef.current.values()]), []);

  const publishPending = useCallback((prepared?: SelectionSyncDiff[]) => {
    const pending = prepared ?? queueValues();
    setPendingCount(pending.length);
    const nextImageIds = pendingSelectionImageIds(pending);
    setPendingImageIds((current) => {
      if (current.size !== nextImageIds.size) return nextImageIds;
      for (const imageId of nextImageIds) if (!current.has(imageId)) return nextImageIds;
      return current;
    });
    return pending;
  }, [queueValues]);

  const persist = useCallback((prepared?: SelectionSyncDiff[]) => {
    const payload: PersistedSelectionSyncQueue = {
      version: 1,
      clientId: clientIdRef.current,
      nextSeq: nextSeqRef.current,
      diffs: prepared ?? queueValues(),
      lastSavedAt: lastSavedAtRef.current,
    };
    persistenceRef.current?.schedule({ storageKey, payload });
  }, [queueValues, storageKey]);

  const flushPersistence = useCallback(() => persistenceRef.current?.flush() ?? true, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flushRef = useRef<(immediate?: boolean) => Promise<boolean>>(async () => true);

  const schedule = useCallback((delay = SELECTION_SYNC_DEBOUNCE_MS) => {
    clearTimer();
    if (!enabled || !queueRef.current.size) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flushRef.current();
    }, delay);
  }, [clearTimer, enabled]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (!enabled) return queueRef.current.size === 0;
    if (inFlightRef.current) return inFlightRef.current;
    const batch = queueValues().slice(0, SELECTION_SYNC_BATCH_LIMIT);
    if (!batch.length) {
      setStatus("saved");
      setMessage("");
      return true;
    }
    clearTimer();
    flushPersistence();
    setStatus("saving");
    setMessage("");
    const request = (async () => {
      try {
        const snapshot = await sendBatchRef.current({ clientId: clientIdRef.current, diffs: batch });
        for (const sent of batch) {
          const key = selectionSyncDiffKey(sent);
          const current = queueRef.current.get(key);
          if (current && current.clientSeq <= sent.clientSeq) queueRef.current.delete(key);
        }
        retryAttemptRef.current = 0;
        const savedAt = new Date().toISOString();
        lastSavedAtRef.current = savedAt;
        setLastSavedAt(savedAt);
        const pending = queueValues();
        publishPending(pending);
        onSnapshotRef.current(snapshot, pending);
        setStatus(pending.length ? "waiting" : "saved");
        setMessage("");
        persist(pending);
        if (pending.length) schedule(0);
        return true;
      } catch (cause) {
        const error = cause instanceof SelectionSyncRequestError
          ? cause
          : new SelectionSyncRequestError(cause instanceof Error ? cause.message : "선택을 저장하지 못했습니다.");
        const retryable = error.options?.retryable !== false;
        const pending = queueValues();
        publishPending(pending);
        persist(pending);
        setMessage(error.message);
        if (!retryable) {
          setStatus("error");
          return false;
        }
        const delay = error.options?.retryAfterMs ?? selectionSyncRetryDelay(retryAttemptRef.current);
        retryAttemptRef.current += 1;
        setStatus("retrying");
        schedule(delay);
        return false;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = request;
    return request;
  }, [clearTimer, enabled, flushPersistence, persist, publishPending, queueValues, schedule]);

  useEffect(() => { flushRef.current = flush; }, [flush]);

  const enqueue = useCallback((patches: readonly SelectionSyncPatch[]) => {
    if (!enabled || !patches.length) return;
    const split = splitSelectionSyncPatches(patches, nextSeqRef.current);
    nextSeqRef.current = split.nextSeq;
    for (const diff of split.diffs) queueRef.current.set(selectionSyncDiffKey(diff), diff);
    const pending = queueValues();
    publishPending(pending);
    onPendingChangeRef.current?.(pending);
    setStatus("waiting");
    setMessage("");
    persist(pending);
    schedule();
  }, [enabled, persist, publishPending, queueValues, schedule]);

  const flushNow = useCallback(async () => {
    clearTimer();
    while (queueRef.current.size) {
      const done = await flushRef.current(true);
      if (!done && queueRef.current.size) return false;
    }
    return queueRef.current.size === 0;
  }, [clearTimer]);

  const retry = useCallback(() => {
    retryAttemptRef.current = 0;
    setStatus(queueRef.current.size ? "waiting" : "saved");
    setMessage("");
    schedule(0);
  }, [schedule]);

  useEffect(() => {
    flushPersistence();
    clearTimer();
    queueRef.current = new Map();
    retryAttemptRef.current = 0;
    clientIdRef.current = createClientId();
    nextSeqRef.current = 1;
    lastSavedAtRef.current = null;
    setPendingCount(0);
    setPendingImageIds(new Set());
    setLastSavedAt(null);
    setStatus("saved");
    setMessage("");
    const restored = parsePersistedSelectionSyncQueue(localStorage.getItem(storageKey));
    if (restored) {
      clientIdRef.current = restored.clientId;
      nextSeqRef.current = restored.nextSeq;
      lastSavedAtRef.current = restored.lastSavedAt;
      queueRef.current = new Map(restored.diffs.map((diff) => [selectionSyncDiffKey(diff), diff]));
      setLastSavedAt(restored.lastSavedAt);
      const pending = queueValues();
      publishPending(pending);
      if (pending.length) {
        setStatus("retrying");
        onRestoreRef.current?.(pending);
        schedule(250);
      }
    }
    return () => {
      clearTimer();
    };
  }, [clearTimer, flushPersistence, publishPending, queueValues, schedule, storageKey]);

  useEffect(() => {
    if (!pendingCount) return;
    const warn = (event: BeforeUnloadEvent) => {
      flushPersistence();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flushPersistence, pendingCount]);

  useEffect(() => () => { flushPersistence(); }, [flushPersistence]);

  return useMemo(() => ({
    enqueue,
    flushNow,
    retry,
    getPendingDiffs: queueValues,
    status,
    pendingCount,
    pendingImageIds,
    lastSavedAt,
    message,
  }), [enqueue, flushNow, lastSavedAt, message, pendingCount, pendingImageIds, queueValues, retry, status]);
}
