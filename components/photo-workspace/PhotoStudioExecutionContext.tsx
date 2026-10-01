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
  cancelRemotePhotoSortJob,
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
import { useRemotePhotoJobStore, type RemotePhotoPollingState } from "@/lib/store/useRemotePhotoJobStore";

export type RemotePollingState = RemotePhotoPollingState;

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
  cancelRemoteJob: () => Promise<void>;
  workerPresence: RemoteWorkerPresence;
  workerPollingState: RemotePollingState;
  refreshWorkerPresence: () => void;
  /** File System Access handles cannot be serialized. Keep the active local work folder only while this workspace is open. */
  currentLocalFolder: FileSystemDirectoryHandle | null;
  setCurrentLocalFolder: (folder: FileSystemDirectoryHandle | null) => void;
  /** JPG selection is deliberately separate from a folder: RAW matching consumes it, other tools do not. */
  selectedJpgNames: string[];
  setSelectedJpgNames: (names: readonly string[]) => void;
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
  const remoteJob = useRemotePhotoJobStore((state) => state.job);
  const remotePollingState = useRemotePhotoJobStore((state) => state.pollingState);
  const remotePollingMessage = useRemotePhotoJobStore((state) => state.pollingMessage);
  const [workerPresence, setWorkerPresence] = useState<RemoteWorkerPresence>(EMPTY_WORKER);
  const [workerPollingState, setWorkerPollingState] = useState<RemotePollingState>("idle");
  const [workerRefreshKey, setWorkerRefreshKey] = useState(0);
  const [currentLocalFolder, setCurrentLocalFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [selectedJpgNames, setSelectedJpgNamesState] = useState<string[]>([]);

  const setSelectedJpgNames = useCallback((names: readonly string[]) => {
    const unique = new Map<string, string>();
    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const key = trimmed.normalize("NFC").toLocaleLowerCase("en-US");
      if (!unique.has(key)) unique.set(key, trimmed);
    }
    setSelectedJpgNamesState([...unique.values()]);
  }, []);

  useEffect(() => {
    try {
      const storedMode = readPhotoStudioExecutionMode(localStorage);
      setExecutionModeState(resolvePhotoExecutionMode(surface, storedMode));
      const storedJobId = localStorage.getItem(PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY);
      if (storedJobId) useRemotePhotoJobStore.getState().setTrackedJobId(storedJobId);
    } catch {
      setExecutionModeState(resolvePhotoExecutionMode(surface));
    }
  }, [surface]);

  const setExecutionMode = useCallback((nextMode: ExecutionMode) => {
    if (!photoSourceModesForSurface(surface).includes(nextMode)) return;
    setExecutionModeState(nextMode);
    try {
      localStorage.setItem(PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY, nextMode);
    } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
  }, [surface]);

  const trackRemoteJob = useCallback((job: RemotePhotoSortJob) => {
    useRemotePhotoJobStore.getState().setTrackedJob(job);
    try {
      localStorage.setItem(PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY, job.id);
    } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
  }, []);

  const clearRemoteJob = useCallback(() => {
    useRemotePhotoJobStore.getState().clearTrackedJob();
    try {
      localStorage.removeItem(PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY);
    } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
  }, []);

  const cancelRemoteJob = useCallback(async () => {
    const current = useRemotePhotoJobStore.getState().job;
    if (!current) throw new Error("취소할 Mac Studio 작업이 없습니다.");
    const updated = await cancelRemotePhotoSortJob(current.id);
    useRemotePhotoJobStore.getState().setTrackedJob(updated);
  }, []);

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
    cancelRemoteJob,
    workerPresence,
    workerPollingState,
    refreshWorkerPresence: () => setWorkerRefreshKey((key) => key + 1),
    currentLocalFolder,
    setCurrentLocalFolder,
    selectedJpgNames,
    setSelectedJpgNames,
  }), [
    availableModes,
    clearRemoteJob,
    cancelRemoteJob,
    executionMode,
    remoteJob,
    remotePollingMessage,
    remotePollingState,
    setExecutionMode,
    trackRemoteJob,
    currentLocalFolder,
    workerPollingState,
    workerPresence,
    selectedJpgNames,
    setSelectedJpgNames,
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
