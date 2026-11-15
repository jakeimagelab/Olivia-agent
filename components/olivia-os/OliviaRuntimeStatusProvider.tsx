"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { normalizeStatusPanelData } from "@/lib/system-status/panelModel";
import { loadStatusPanelData } from "@/lib/system-status/statusPanelClient";
import type { StatusPanelData } from "@/lib/system-status/panelTypes";

const ACTIVE_JOB_POLL_MS = 5_000;
const VISIBLE_POLL_MS = 30_000;
const HIDDEN_POLL_MS = 60_000;

type RuntimeStatusContextValue = {
  data: StatusPanelData | null;
  loading: boolean;
  initialized: boolean;
  error: boolean;
  refresh: (options?: { force?: boolean }) => Promise<void>;
};

const RuntimeStatusContext = createContext<RuntimeStatusContextValue | null>(null);

function hasActiveRemoteJob(data: StatusPanelData | null) {
  return Boolean(data?.progress.some((entry) => (
    entry.kind === "remote_job_progress"
    && entry.remoteJob
    && ["QUEUED", "RUNNING"].includes(entry.remoteJob.status)
  )));
}

export function resolveOliviaRuntimeStatusPollDelay(
  data: StatusPanelData | null,
  visibilityState: DocumentVisibilityState,
) {
  if (visibilityState === "hidden") return HIDDEN_POLL_MS;
  return hasActiveRemoteJob(data) ? ACTIVE_JOB_POLL_MS : VISIBLE_POLL_MS;
}

export function OliviaRuntimeStatusProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StatusPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(false);
  const dataRef = useRef<StatusPanelData | null>(null);
  const initializedRef = useRef(false);
  const requestSequenceRef = useRef(0);

  const refresh = useCallback(async (options: { force?: boolean } = {}) => {
    const requestSequence = ++requestSequenceRef.current;
    if (!initializedRef.current) setLoading(true);
    try {
      const next = normalizeStatusPanelData(await loadStatusPanelData(options));
      if (requestSequence !== requestSequenceRef.current) return;
      dataRef.current = next;
      setData(next);
      setError(false);
    } catch {
      if (requestSequence === requestSequenceRef.current) setError(true);
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        initializedRef.current = true;
        setInitialized(true);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    let reading = false;
    let rerunWhenReady = false;

    const schedule = () => {
      if (!active) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(
        () => void read(),
        resolveOliviaRuntimeStatusPollDelay(dataRef.current, document.visibilityState),
      );
    };

    const read = async () => {
      if (reading) {
        rerunWhenReady = true;
        return;
      }
      reading = true;
      await refresh();
      reading = false;
      if (!active) return;
      if (rerunWhenReady) {
        rerunWhenReady = false;
        void read();
        return;
      }
      schedule();
    };

    const onVisibilityChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (document.visibilityState === "visible") void read();
      else schedule();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void read();
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [refresh]);

  const value = useMemo<RuntimeStatusContextValue>(() => ({
    data,
    loading,
    initialized,
    error,
    refresh,
  }), [data, error, initialized, loading, refresh]);

  return <RuntimeStatusContext.Provider value={value}>{children}</RuntimeStatusContext.Provider>;
}

export function useOliviaRuntimeStatus() {
  const value = useContext(RuntimeStatusContext);
  if (!value) throw new Error("useOliviaRuntimeStatus must be used inside OliviaRuntimeStatusProvider");
  return value;
}
