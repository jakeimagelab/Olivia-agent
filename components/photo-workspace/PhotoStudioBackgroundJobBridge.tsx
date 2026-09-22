"use client";

import { useEffect } from "react";
import { getRemotePhotoSortJob, type RemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";
import { PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY } from "@/lib/photo-classifier/photoSource";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import { useRemotePhotoJobStore } from "@/lib/store/useRemotePhotoJobStore";

const POLL_INTERVAL_MS = 3_000;
const HIDDEN_POLL_INTERVAL_MS = 30_000;
const OPERATION_ACTIVE_POLL_INTERVAL_MS = 5_000;
const OPERATION_IDLE_POLL_INTERVAL_MS = 60_000;
const OPERATION_HIDDEN_POLL_INTERVAL_MS = 5 * 60_000;
const TERMINAL_DISCOVERY_WINDOW_MS = 10 * 60 * 1_000;
const PHOTO_OPERATION_ACTIONS = new Set(["PHOTO_RAW_MATCH", "PHOTO_RESIZE", "PHOTO_AI_SELECT", "PHOTO_RETOUCH"]);
const SEEN_TERMINAL_KEY = "olivia:photo-operations:seen-terminal";

type PhotoOperationJob = {
  id: string;
  action: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  progress?: { current?: number; total?: number; message?: string } | null;
  message?: string | null;
  error?: string | null;
  created_at: string;
  completed_at?: string | null;
};

const OPERATION_PRESENTATION: Record<string, { label: string; mode: string; extra?: string }> = {
  PHOTO_RAW_MATCH: { label: "Mac Studio RAW 매칭", mode: "raw-match", extra: "&rawMatchView=match" },
  PHOTO_RESIZE: { label: "Mac Studio 사진 리사이즈", mode: "resize" },
  PHOTO_AI_SELECT: { label: "Mac Studio AI 컷 정리", mode: "raw-match", extra: "&rawMatchView=ai-cull" },
  PHOTO_RETOUCH: { label: "Mac Studio 사진 보정 분석", mode: "retouch" },
};

function readSeenTerminalIds(): Set<string> {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SEEN_TERMINAL_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function rememberTerminalId(ids: Set<string>, id: string) {
  ids.add(id);
  try {
    window.sessionStorage.setItem(SEEN_TERMINAL_KEY, JSON.stringify([...ids].slice(-100)));
  } catch (error) {
    console.warn("[photo operation bridge] terminal 상태를 sessionStorage에 저장하지 못했습니다.", error);
  }
}

function readStoredRemoteJobId(): string | null {
  try {
    const value = window.localStorage.getItem(PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function progressValues(job: RemotePhotoSortJob): { current: number; total: number; message: string } {
  const progress = job.progress;
  return {
    current: typeof progress?.current === "number" ? progress.current : 0,
    total: typeof progress?.total === "number" ? progress.total : 0,
    message: progress?.message || job.message || "Mac Studio 작업 상태를 확인하고 있습니다.",
  };
}

/**
 * PhotoStudioExecutionProvider가 창과 함께 unmount되어도 원격 PHOTO_SORT job을 계속 관찰한다.
 * 실제 실행은 Mac Studio Worker가 소유하고, 이 컴포넌트는 localStorage의 job id를 기준으로
 * 상태를 다시 읽어 전역 BackgroundJobsWidget에 표시만 한다.
 */
export default function PhotoStudioBackgroundJobBridge() {
  const trackedJobId = useRemotePhotoJobStore((state) => state.jobId);

  // 새로고침 복구와 다른 탭에서 시작/종료한 작업만 localStorage에서 동기화한다. 같은 탭에서
  // 시작한 작업은 trackRemoteJob()이 store를 즉시 갱신하므로 1초짜리 storage watcher가 필요 없다.
  useEffect(() => {
    const syncStoredJob = () => {
      const storedJobId = readStoredRemoteJobId();
      const store = useRemotePhotoJobStore.getState();
      if (storedJobId !== store.jobId) store.setTrackedJobId(storedJobId);
    };
    syncStoredJob();
    window.addEventListener("storage", syncStoredJob);
    return () => window.removeEventListener("storage", syncStoredJob);
  }, []);

  useEffect(() => {
    let disposed = false;
    let terminalJobId: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let request: AbortController | null = null;
    let failureCount = 0;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const schedule = (delay: number) => {
      if (disposed) return;
      clearTimer();
      timer = setTimeout(() => void poll(), delay);
    };

    const mirrorJob = (job: RemotePhotoSortJob) => {
      useRemotePhotoJobStore.getState().setTrackedJob(job);
      const values = progressValues(job);
      const store = useBackgroundJobsStore.getState();
      const existing = store.jobs[job.id];
      const isTerminal = job.status === "COMPLETED" || job.status === "FAILED";

      if (!existing) {
        store.startJob({
          id: job.id,
          label: "Mac Studio 사진 분류",
          cur: values.current,
          total: values.total,
          msg: values.message,
          status: isTerminal ? (job.status === "FAILED" ? "error" : "done") : "running",
          returnPath: "/photo-sorting?mode=classification",
          cancelRef: { current: false },
          cancelable: false,
        });
      } else {
        store.updateJob(job.id, { cur: values.current, total: values.total, msg: values.message });
        if (isTerminal) store.finishJob(job.id, job.status === "FAILED" ? "error" : "done");
      }

      if (isTerminal) terminalJobId = job.id;
    };

    const poll = async () => {
      const jobId = trackedJobId;
      if (disposed || !jobId || terminalJobId === jobId || request) return;

      request = new AbortController();
      try {
        const job = await getRemotePhotoSortJob(jobId, { signal: request.signal });
        if (disposed) return;
        failureCount = 0;
        mirrorJob(job);
        if (job.status !== "COMPLETED" && job.status !== "FAILED") {
          schedule(document.visibilityState === "hidden" ? HIDDEN_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (disposed || request.signal.aborted) return;
        failureCount += 1;
        const store = useBackgroundJobsStore.getState();
        const existing = store.jobs[jobId];
        const message = "Mac Studio에서 작업은 계속 진행 중입니다. 연결을 다시 확인하고 있습니다.";
        if (existing) {
          store.updateJob(jobId, { cur: existing.cur, total: existing.total, msg: message });
        } else {
          store.startJob({
            id: jobId,
            label: "Mac Studio 사진 분류",
            cur: 0,
            total: 0,
            msg: message,
            status: "running",
            returnPath: "/photo-sorting?mode=classification",
            cancelRef: { current: false },
            cancelable: false,
          });
        }
        useRemotePhotoJobStore.getState().setPollingFailure(message);
        // 일시적인 네트워크 오류는 실패가 아니다. 호출 폭주를 막기 위해 5→10→30초로 물러난다.
        schedule(Math.min(30_000, failureCount * 5_000));
        void error;
      } finally {
        request = null;
      }
    };

    const refreshNow = () => {
      if (document.visibilityState === "visible") {
        clearTimer();
        void poll();
      }
    };

    if (trackedJobId) void poll();
    window.addEventListener("focus", refreshNow);
    window.addEventListener("online", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);

    return () => {
      disposed = true;
      clearTimer();
      request?.abort();
      window.removeEventListener("focus", refreshNow);
      window.removeEventListener("online", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
    };
  }, [trackedJobId]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let request: AbortController | null = null;
    const seenTerminalIds = readSeenTerminalIds();

    const schedule = (delay = OPERATION_IDLE_POLL_INTERVAL_MS) => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void poll(), delay);
    };

    const mirror = (job: PhotoOperationJob) => {
      const presentation = OPERATION_PRESENTATION[job.action];
      if (!presentation) return;
      const store = useBackgroundJobsStore.getState();
      const existing = store.jobs[job.id];
      const terminal = job.status === "COMPLETED" || job.status === "FAILED";
      const completedAt = new Date(job.completed_at || job.created_at).getTime();
      const recentTerminal = terminal && Number.isFinite(completedAt) && Date.now() - completedAt <= TERMINAL_DISCOVERY_WINDOW_MS;
      if (terminal && !existing && (!recentTerminal || seenTerminalIds.has(job.id))) return;
      const current = typeof job.progress?.current === "number" ? job.progress.current : 0;
      const total = typeof job.progress?.total === "number" ? job.progress.total : 0;
      const message = job.progress?.message || job.message || (job.status === "QUEUED" ? "Mac Studio 작업 대기 중" : "Mac Studio 작업 중");
      if (!existing) {
        store.startJob({
          id: job.id,
          label: presentation.label,
          cur: current,
          total,
          msg: terminal && job.status === "FAILED" ? job.error || "작업 중 확인이 필요합니다." : message,
          status: terminal ? (job.status === "FAILED" ? "error" : "done") : "running",
          returnPath: `/photo-sorting?mode=${presentation.mode}${presentation.extra || ""}&remoteJobId=${encodeURIComponent(job.id)}`,
          cancelRef: { current: false },
          cancelable: false,
        });
      } else {
        store.updateJob(job.id, { cur: current, total, msg: terminal && job.status === "FAILED" ? job.error || message : message });
        if (terminal) store.finishJob(job.id, job.status === "FAILED" ? "error" : "done");
      }
      if (terminal) rememberTerminalId(seenTerminalIds, job.id);
    };

    const poll = async () => {
      if (disposed || request) return;
      request = new AbortController();
      try {
        const response = await fetch("/api/remote-jobs", { cache: "no-store", signal: request.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "원격 작업 조회 실패");
        let hasActiveOperation = false;
        if (!disposed && Array.isArray(body.jobs)) {
          for (const job of body.jobs as PhotoOperationJob[]) {
            if (!PHOTO_OPERATION_ACTIONS.has(job.action)) continue;
            mirror(job);
            if (job.status === "QUEUED" || job.status === "RUNNING") hasActiveOperation = true;
          }
        }
        schedule(document.visibilityState === "hidden"
          ? OPERATION_HIDDEN_POLL_INTERVAL_MS
          : hasActiveOperation ? OPERATION_ACTIVE_POLL_INTERVAL_MS : OPERATION_IDLE_POLL_INTERVAL_MS);
      } catch {
        schedule(30_000);
      } finally {
        request = null;
      }
    };

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void poll();
    };
    void poll();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      request?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return null;
}
