"use client";

import { useEffect } from "react";
import { getRemotePhotoSortJob, type RemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";
import { PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY } from "@/lib/photo-classifier/photoSource";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";

const POLL_INTERVAL_MS = 1_000;
const HIDDEN_POLL_INTERVAL_MS = 3_000;

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
  useEffect(() => {
    let disposed = false;
    let activeJobId: string | null = null;
    let terminalJobId: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let watcher: ReturnType<typeof setInterval> | null = null;
    let request: AbortController | null = null;
    let failureCount = 0;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const removeJob = (jobId: string | null) => {
      if (!jobId) return;
      if (useBackgroundJobsStore.getState().jobs[jobId]) {
        useBackgroundJobsStore.getState().dismissJob(jobId);
      }
    };

    const schedule = (delay: number) => {
      if (disposed) return;
      clearTimer();
      timer = setTimeout(() => void poll(), delay);
    };

    const mirrorJob = (job: RemotePhotoSortJob) => {
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
      const jobId = activeJobId;
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
        // 일시적인 네트워크 오류는 실패가 아니다. 1→2→3초까지만 완만하게 재시도한다.
        schedule(Math.min(3_000, failureCount * 1_000));
        void error;
      } finally {
        request = null;
      }
    };

    const syncStoredJob = () => {
      const nextJobId = readStoredRemoteJobId();
      if (nextJobId !== activeJobId) {
        removeJob(activeJobId);
        activeJobId = nextJobId;
        terminalJobId = null;
        failureCount = 0;
        clearTimer();
      }
      if (activeJobId && terminalJobId !== activeJobId) void poll();
    };

    const refreshNow = () => {
      syncStoredJob();
      if (document.visibilityState === "visible") {
        clearTimer();
        void poll();
      }
    };

    syncStoredJob();
    watcher = setInterval(syncStoredJob, POLL_INTERVAL_MS);
    window.addEventListener("focus", refreshNow);
    window.addEventListener("online", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);

    return () => {
      disposed = true;
      clearTimer();
      if (watcher) clearInterval(watcher);
      request?.abort();
      window.removeEventListener("focus", refreshNow);
      window.removeEventListener("online", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
    };
  }, []);

  return null;
}
