"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parsePersistedSelectionSyncQueue,
  pendingSelectionImageIds,
  selectionSyncRetryDelay,
  SELECTION_SYNC_BATCH_LIMIT,
  SELECTION_SYNC_DEBOUNCE_MS,
  type SelectionSyncDiff,
  type SelectionSyncPatch,
} from "@/lib/person-select/selectionSync";
import { SelectionSyncQueueBuffer } from "@/lib/person-select/selectionSyncQueueBuffer";
import { SelectionSyncRequestError } from "@/lib/person-select/selectionSyncClient";
import { useSelectionSyncBrowserPersistence } from "@/components/person-select/useSelectionSyncBrowserPersistence";

export { SelectionSyncRequestError } from "@/lib/person-select/selectionSyncClient";
export { SELECTION_SYNC_STORAGE_EVENT } from "@/components/person-select/useSelectionSyncBrowserPersistence";

export type SelectionSyncQueueStatus = "saved" | "waiting" | "saving" | "retrying" | "error";

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
  const [status, setStatus] = useState<SelectionSyncQueueStatus>("saved");
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingImageIds, setPendingImageIds] = useState<Set<string>>(() => new Set());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const bufferRef = useRef(new SelectionSyncQueueBuffer(createClientId()));
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const retryAttemptRef = useRef(0);
  const sendBatchRef = useRef(sendBatch);
  const onSnapshotRef = useRef(onSnapshot);
  const onRestoreRef = useRef(onRestore);
  const onPendingChangeRef = useRef(onPendingChange);
  const { schedulePersistence, flushPersistence } = useSelectionSyncBrowserPersistence();

  useEffect(() => { sendBatchRef.current = sendBatch; }, [sendBatch]);
  useEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);
  useEffect(() => { onRestoreRef.current = onRestore; }, [onRestore]);
  useEffect(() => { onPendingChangeRef.current = onPendingChange; }, [onPendingChange]);

  const queueValues = useCallback(() => bufferRef.current.values(), []);

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
    schedulePersistence(storageKey, bufferRef.current.persisted(prepared));
  }, [schedulePersistence, storageKey]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flushRef = useRef<(immediate?: boolean) => Promise<boolean>>(async () => true);

  const schedule = useCallback((delay = SELECTION_SYNC_DEBOUNCE_MS) => {
    clearTimer();
    if (!enabled || !bufferRef.current.size) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flushRef.current();
    }, delay);
  }, [clearTimer, enabled]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (!enabled) return bufferRef.current.size === 0;
    if (inFlightRef.current) return inFlightRef.current;
    const batch = bufferRef.current.batch(SELECTION_SYNC_BATCH_LIMIT);
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
        const snapshot = await sendBatchRef.current({ clientId: bufferRef.current.clientId, diffs: batch });
        bufferRef.current.acknowledge(batch);
        retryAttemptRef.current = 0;
        const savedAt = new Date().toISOString();
        bufferRef.current.markSaved(savedAt);
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
    const pending = bufferRef.current.enqueue(patches);
    publishPending(pending);
    onPendingChangeRef.current?.(pending);
    setStatus("waiting");
    setMessage("");
    persist(pending);
    schedule();
  }, [enabled, persist, publishPending, schedule]);

  const flushNow = useCallback(async () => {
    clearTimer();
    while (bufferRef.current.size) {
      const done = await flushRef.current(true);
      if (!done && bufferRef.current.size) return false;
    }
    return bufferRef.current.size === 0;
  }, [clearTimer]);

  const retry = useCallback(() => {
    retryAttemptRef.current = 0;
    setStatus(bufferRef.current.size ? "waiting" : "saved");
    setMessage("");
    schedule(0);
  }, [schedule]);

  useEffect(() => {
    flushPersistence();
    clearTimer();
    bufferRef.current.reset(createClientId());
    retryAttemptRef.current = 0;
    setPendingCount(0);
    setPendingImageIds(new Set());
    setLastSavedAt(null);
    setStatus("saved");
    setMessage("");
    const restored = parsePersistedSelectionSyncQueue(localStorage.getItem(storageKey));
    if (restored) {
      const pending = bufferRef.current.restore(restored);
      setLastSavedAt(restored.lastSavedAt);
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
  }, [clearTimer, flushPersistence, publishPending, schedule, storageKey]);

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
