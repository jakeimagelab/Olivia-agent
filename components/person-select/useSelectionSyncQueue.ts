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

  useEffect(() => { sendBatchRef.current = sendBatch; }, [sendBatch]);
  useEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);
  useEffect(() => { onRestoreRef.current = onRestore; }, [onRestore]);
  useEffect(() => { onPendingChangeRef.current = onPendingChange; }, [onPendingChange]);

  const queueValues = useCallback(() => compactSelectionSyncDiffs([...queueRef.current.values()]), []);

  const publishPending = useCallback(() => {
    const pending = queueValues();
    setPendingCount(pending.length);
    setPendingImageIds(pendingSelectionImageIds(pending));
    return pending;
  }, [queueValues]);

  const persist = useCallback(() => {
    try {
      const payload: PersistedSelectionSyncQueue = {
        version: 1,
        clientId: clientIdRef.current,
        nextSeq: nextSeqRef.current,
        diffs: queueValues(),
        lastSavedAt: lastSavedAtRef.current,
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent(SELECTION_SYNC_STORAGE_EVENT, { detail: { storageKey } }));
    } catch {
      // 브라우저 저장소를 사용할 수 없어도 현재 탭의 재시도 큐는 유지한다.
    }
  }, [queueValues, storageKey]);

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
        const pending = publishPending();
        onSnapshotRef.current(snapshot, pending);
        setStatus(pending.length ? "waiting" : "saved");
        setMessage("");
        persist();
        if (pending.length) schedule(0);
        return true;
      } catch (cause) {
        const error = cause instanceof SelectionSyncRequestError
          ? cause
          : new SelectionSyncRequestError(cause instanceof Error ? cause.message : "선택을 저장하지 못했습니다.");
        const retryable = error.options?.retryable !== false;
        publishPending();
        persist();
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
  }, [clearTimer, enabled, persist, publishPending, queueValues, schedule]);

  useEffect(() => { flushRef.current = flush; }, [flush]);

  const enqueue = useCallback((patches: readonly SelectionSyncPatch[]) => {
    if (!enabled || !patches.length) return;
    const split = splitSelectionSyncPatches(patches, nextSeqRef.current);
    nextSeqRef.current = split.nextSeq;
    for (const diff of split.diffs) queueRef.current.set(selectionSyncDiffKey(diff), diff);
    const pending = publishPending();
    onPendingChangeRef.current?.(pending);
    setStatus("waiting");
    setMessage("");
    persist();
    schedule();
  }, [enabled, persist, publishPending, schedule]);

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
      const pending = publishPending();
      if (pending.length) {
        setStatus("retrying");
        onRestoreRef.current?.(pending);
        schedule(250);
      }
    }
    return () => {
      clearTimer();
    };
  }, [clearTimer, publishPending, schedule, storageKey]);

  useEffect(() => {
    if (!pendingCount) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingCount]);

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
