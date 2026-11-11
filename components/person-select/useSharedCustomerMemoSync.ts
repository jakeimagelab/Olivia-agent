"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectionSyncRetryDelay, SELECTION_SYNC_DEBOUNCE_MS } from "@/lib/person-select/selectionSync";

export type SharedCustomerMemoSyncStatus = "saved" | "waiting" | "saving" | "retrying" | "error";

export function useSharedCustomerMemoSync<TSnapshot>(input: {
  storageKey: string;
  endpoint: string;
  initialValue: string;
  enabled: boolean;
  onSnapshot: (snapshot: TSnapshot) => void;
}) {
  const { storageKey, endpoint, initialValue, enabled, onSnapshot } = input;
  const [value, setValueState] = useState(initialValue);
  const [status, setStatus] = useState<SharedCustomerMemoSyncStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const valueRef = useRef(initialValue);
  const dirtyRef = useRef(false);
  const changeSeqRef = useRef(0);
  const retryAttemptRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const onSnapshotRef = useRef(onSnapshot);

  useEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const persist = useCallback((nextValue = valueRef.current, dirty = dirtyRef.current) => {
    try {
      if (!dirty) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify({ version: 1, value: nextValue, dirty: true }));
    } catch {
      // 현재 탭의 메모와 재시도 상태는 계속 유지한다.
    }
  }, [storageKey]);

  const saveRef = useRef<() => Promise<boolean>>(async () => true);
  const schedule = useCallback((delay = SELECTION_SYNC_DEBOUNCE_MS) => {
    clearTimer();
    if (!enabled || !dirtyRef.current) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void saveRef.current();
    }, delay);
  }, [clearTimer, enabled]);

  const save = useCallback(async () => {
    if (!enabled) return !dirtyRef.current;
    if (inFlightRef.current) return inFlightRef.current;
    if (!dirtyRef.current) return true;
    clearTimer();
    const sentValue = valueRef.current;
    const sentSeq = changeSeqRef.current;
    setStatus("saving");
    const request = (async () => {
      try {
        const response = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerMemoOnly: true, customerMemo: sentValue }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok || !result.draft) throw new Error(result.error ?? "전체 메모를 저장하지 못했습니다.");
        onSnapshotRef.current(result.draft as TSnapshot);
        retryAttemptRef.current = 0;
        setLastSavedAt(new Date().toISOString());
        if (changeSeqRef.current === sentSeq) {
          dirtyRef.current = false;
          setStatus("saved");
          persist(sentValue, false);
        } else {
          setStatus("waiting");
          persist();
          schedule(0);
        }
        return true;
      } catch {
        persist();
        setStatus("retrying");
        schedule(selectionSyncRetryDelay(retryAttemptRef.current));
        retryAttemptRef.current += 1;
        return false;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = request;
    return request;
  }, [clearTimer, enabled, endpoint, persist, schedule]);
  useEffect(() => { saveRef.current = save; }, [save]);

  const setValue = useCallback((nextValue: string) => {
    valueRef.current = nextValue;
    setValueState(nextValue);
    dirtyRef.current = true;
    changeSeqRef.current += 1;
    setStatus("waiting");
    persist(nextValue, true);
    schedule();
  }, [persist, schedule]);

  const flushNow = useCallback(async () => {
    clearTimer();
    while (dirtyRef.current) {
      if (!(await saveRef.current())) return false;
    }
    return true;
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();
    valueRef.current = initialValue;
    setValueState(initialValue);
    dirtyRef.current = false;
    changeSeqRef.current = 0;
    retryAttemptRef.current = 0;
    setStatus("saved");
    setLastSavedAt(null);
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null") as { version?: unknown; value?: unknown; dirty?: unknown } | null;
      if (parsed?.version === 1 && parsed.dirty === true && typeof parsed.value === "string") {
        valueRef.current = parsed.value;
        setValueState(parsed.value);
        dirtyRef.current = true;
        changeSeqRef.current = 1;
        setStatus("retrying");
        schedule(250);
      }
    } catch {
      // 손상된 선택적 브라우저 저장값은 무시한다.
    }
    return clearTimer;
  }, [clearTimer, initialValue, schedule, storageKey]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  return { value, setValue, status, lastSavedAt, pending: status !== "saved", flushNow };
}
