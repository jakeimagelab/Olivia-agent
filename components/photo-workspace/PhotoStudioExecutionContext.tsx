"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getRemotePhotoSortJob,
  type RemotePhotoSortJob,
} from "@/lib/photo-classifier/remotePhotoSort";
import {
  PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY,
  PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY,
  photoSourceModesForSurface,
  readPhotoStudioExecutionMode,
  resolvePhotoExecutionMode,
  type ExecutionMode,
} from "@/lib/photo-classifier/photoSource";
import type { RemoteWorkerPresence } from "@/lib/remote-jobs/workerPresence";
import { usePhotoSourceSurface } from "@/components/photo-classifier/usePhotoSourceSurface";

export type RemotePollingState = "idle" | "connected" | "reconnecting";

type PhotoStudioExecutionValue = {
  executionMode: ExecutionMode;
  availableModes: readonly ExecutionMode[];
  setExecutionMode: (mode: ExecutionMode) => void;
  remoteJob: RemotePhotoSortJob | null;
  remoteJobActive: boolean;
  remotePollingState: RemotePollingState;
  remotePollingMessage: string;
  trackRemoteJob: (job: RemotePhotoSortJob) => void;
  clearRemoteJob: () => void;
  workerPresence: RemoteWorkerPresence;
  workerPollingState: RemotePollingState;
  refreshWorkerPresence: () => void;
};

const EMPTY_WORKER: RemoteWorkerPresence = {
  workerId: "jake-macstudio-01",
  online: null,
  lastSeenAt: null,
  nasConnected: null,
  workerStatus: null,
};

const PhotoStudioExecutionContext = createContext<PhotoStudioExecutionValue | null>(null);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseWorkerPresence(value: unknown): RemoteWorkerPresence {
  if (!isRecord(value) || !isRecord(value.worker)) return EMPTY_WORKER;
  const worker = value.worker;
  return {
    workerId: typeof worker.id === "string" ? worker.id : EMPTY_WORKER.workerId,
    online: typeof worker.online === "boolean" ? worker.online : null,
    lastSeenAt: typeof worker.last_seen_at === "string" ? worker.last_seen_at : null,
    nasConnected: typeof worker.nas_connected === "boolean" ? worker.nas_connected : null,
    workerStatus: typeof worker.worker_status === "string" ? worker.worker_status : null,
  };
}

export function PhotoStudioExecutionProvider({ children }: { children: ReactNode }) {
  const surface = usePhotoSourceSurface();
  const availableModes = photoSourceModesForSurface(surface);
  const [executionMode, setExecutionModeState] = useState<ExecutionMode>("LOCAL_DIRECT");
  const [remoteJobId, setRemoteJobId] = useState<string | null>(null);
  const [remoteJob, setRemoteJob] = useState<RemotePhotoSortJob | null>(null);
  const [remotePollingState, setRemotePollingState] = useState<RemotePollingState>("idle");
  const [remotePollingMessage, setRemotePollingMessage] = useState("");
  const [workerPresence, setWorkerPresence] = useState<RemoteWorkerPresence>(EMPTY_WORKER);
  const [workerPollingState, setWorkerPollingState] = useState<RemotePollingState>("idle");
  const [workerRefreshKey, setWorkerRefreshKey] = useState(0);

  useEffect(() => {
    try {
      const storedMode = readPhotoStudioExecutionMode(localStorage);
      setExecutionModeState(resolvePhotoExecutionMode(surface, storedMode));
      const storedJobId = localStorage.getItem(PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY);
      if (storedJobId) setRemoteJobId(storedJobId);
    } catch {
      setExecutionModeState(resolvePhotoExecutionMode(surface));
    }
  }, [surface]);

  const setExecutionMode = useCallback((nextMode: ExecutionMode) => {
    if (!photoSourceModesForSurface(surface).includes(nextMode)) return;
    setExecutionModeState(nextMode);
    try {
      localStorage.setItem(PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY, nextMode);
    } catch {}
  }, [surface]);

  const trackRemoteJob = useCallback((job: RemotePhotoSortJob) => {
    setRemoteJob(job);
    setRemoteJobId(job.id);
    setRemotePollingState("connected");
    setRemotePollingMessage("");
    try {
      localStorage.setItem(PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY, job.id);
    } catch {}
  }, []);

  const clearRemoteJob = useCallback(() => {
    setRemoteJobId(null);
    setRemoteJob(null);
    setRemotePollingState("idle");
    setRemotePollingMessage("");
    try {
      localStorage.removeItem(PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    if (!remoteJobId) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let request: AbortController | null = null;
    let failureCount = 0;

    const schedule = (delay: number) => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      if (disposed || request) return;
      request = new AbortController();
      try {
        const job = await getRemotePhotoSortJob(remoteJobId, { signal: request.signal });
        if (disposed) return;
        failureCount = 0;
        setRemoteJob(job);
        setRemotePollingState("connected");
        setRemotePollingMessage("");
        if (job.status === "QUEUED" || job.status === "RUNNING") {
          schedule(document.visibilityState === "hidden" ? 3_000 : 1_000);
        }
      } catch (error) {
        if (disposed || request.signal.aborted) return;
        failureCount += 1;
        setRemotePollingState("reconnecting");
        setRemotePollingMessage(
          error instanceof Error ? error.message : "Mac Studio 연결을 다시 확인하고 있습니다.",
        );
        schedule(Math.min(failureCount, 3) * 1_000);
      } finally {
        request = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = null;
      void poll();
    };

    setRemotePollingState("connected");
    void poll();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleVisibility);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      request?.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleVisibility);
    };
  }, [remoteJobId]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let request: AbortController | null = null;

    const load = async () => {
      request = new AbortController();
      try {
        const response = await fetch("/api/remote-workers/status", {
          cache: "no-store",
          signal: request.signal,
        });
        const body: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("Mac Studio 상태를 확인하지 못했습니다.");
        if (disposed) return;
        setWorkerPresence(parseWorkerPresence(body));
        setWorkerPollingState("connected");
      } catch {
        if (!disposed && !request.signal.aborted) setWorkerPollingState("reconnecting");
      } finally {
        request = null;
        if (!disposed) timer = setTimeout(() => void load(), 10_000);
      }
    };

    void load();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      request?.abort();
    };
  }, [workerRefreshKey]);

  const value = useMemo<PhotoStudioExecutionValue>(() => ({
    executionMode,
    availableModes,
    setExecutionMode,
    remoteJob,
    remoteJobActive: remoteJob?.status === "QUEUED" || remoteJob?.status === "RUNNING",
    remotePollingState,
    remotePollingMessage,
    trackRemoteJob,
    clearRemoteJob,
    workerPresence,
    workerPollingState,
    refreshWorkerPresence: () => setWorkerRefreshKey((key) => key + 1),
  }), [
    availableModes,
    clearRemoteJob,
    executionMode,
    remoteJob,
    remotePollingMessage,
    remotePollingState,
    setExecutionMode,
    trackRemoteJob,
    workerPollingState,
    workerPresence,
  ]);

  return (
    <PhotoStudioExecutionContext.Provider value={value}>
      {children}
    </PhotoStudioExecutionContext.Provider>
  );
}

export function usePhotoStudioExecution(): PhotoStudioExecutionValue {
  const value = useContext(PhotoStudioExecutionContext);
  if (!value) throw new Error("PhotoStudioExecutionProvider 안에서 사용해야 합니다.");
  return value;
}
