"use client";

import { useCallback, useEffect, useState } from "react";
import type { RemoteJobProgress } from "@/lib/remote-jobs/progress";

export type PhotoTaskJob = {
  id: string;
  action: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED" | string;
  payload?: {
    source_relative_path?: string;
    source_folder?: string;
    work_relative_path?: string;
    only?: "all" | "연출" | "프로필" | "인테리어";
  } | null;
  progress?: RemoteJobProgress | null;
  message?: string | null;
  error?: string | null;
  cancel_requested_at?: string | null;
  completed_at?: string | null;
};

const PHOTO_TASK_ACTIONS = new Set([
  "PHOTO_SORT",
  "PHOTO_PREPARE_SOURCE",
  "PHOTO_STAGE_JPG",
  "PHOTO_CLASSIFY_WORK",
  "PERSON_SELECT_IMPORT",
  "PERSON_SELECT_DELIVERY_IMPORT",
  "PERSON_SELECT_DELIVERY_DOWNLOAD",
  "PERSON_SELECT_COLOR_MATCH",
  "PERSON_SELECT_COLOR_RENDER",
  "PHOTO_COLOR_MATCH",
  "PHOTO_COLOR_RENDER",
  "PERSON_SELECT_DELIVERY_PURGE",
  "PERSON_SELECT_RAW_MATCH",
]);

const COMPLETED_VISIBILITY_MS = 8_000;

export function filterVisiblePhotoTaskJobs(jobs: readonly PhotoTaskJob[], now = Date.now()) {
  return jobs.filter((job) => {
    if (!PHOTO_TASK_ACTIONS.has(job.action)) return false;
    if (job.status === "FAILED" || job.status === "CANCELED") return true;
    if (job.status === "QUEUED" || job.status === "RUNNING") return true;
    return job.status === "COMPLETED" && job.completed_at
      ? now - new Date(job.completed_at).getTime() < COMPLETED_VISIBILITY_MS
      : false;
  });
}

/** 원격 사진 작업의 실시간 조회와 재조회 주기를 한곳에서 관리한다. */
export function usePhotoTaskJobs() {
  const [jobs, setJobs] = useState<PhotoTaskJob[]>([]);

  useEffect(() => {
    let mounted = true;
    let timer: number | null = null;
    let reading = false;
    let rerunWhenReady = false;
    let visibleCount = 0;

    const nextDelay = () => document.visibilityState === "hidden" ? 60_000 : visibleCount === 0 ? 30_000 : 5_000;
    const schedule = () => {
      if (!mounted) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void read(), nextDelay());
    };

    const read = async () => {
      if (reading) {
        rerunWhenReady = true;
        return;
      }
      reading = true;
      try {
        const response = await fetch("/api/remote-jobs", { cache: "no-store" });
        const body = await response.json();
        if (!mounted || !response.ok || !body?.ok) return;
        const nextJobs = filterVisiblePhotoTaskJobs((body.jobs as PhotoTaskJob[] | undefined) ?? []);
        visibleCount = Math.min(nextJobs.length, 4);
        setJobs(nextJobs);
      } catch {
        // 상태 표시는 본문을 막으면 안 된다. 다음 주기에 다시 확인한다.
      } finally {
        reading = false;
        if (rerunWhenReady) {
          rerunWhenReady = false;
          void read();
        } else {
          schedule();
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      void read();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void read();
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const updateJob = useCallback((jobId: string, update: (job: PhotoTaskJob) => PhotoTaskJob) => {
    setJobs((current) => current.map((job) => job.id === jobId ? update(job) : job));
  }, []);

  return { jobs, updateJob };
}
