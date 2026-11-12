"use client";

import { useCallback, useRef, useState } from "react";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";

export type PhotoClassificationProgress = {
  cur: number;
  total: number;
  msg: string;
};

export function shouldPublishPhotoClassificationProgress({
  next,
  lastPublishedAt,
  now,
}: {
  next: PhotoClassificationProgress;
  lastPublishedAt: number;
  now: number;
}) {
  const finalUpdate = next.total > 0 && next.cur >= next.total;
  const batchUpdate = next.cur > 0 && next.cur % 20 === 0;
  const stageStart = next.cur === 0;
  return stageStart || finalUpdate || batchUpdate || now - lastPublishedAt >= 120;
}

export function usePhotoClassificationProgress(jobId: string) {
  const [progress, setProgressState] = useState<PhotoClassificationProgress>({
    cur: 0,
    total: 0,
    msg: "",
  });
  const publishedAtRef = useRef(0);

  const updateProgress = useCallback((next: PhotoClassificationProgress) => {
    const now = Date.now();
    if (!shouldPublishPhotoClassificationProgress({
      next,
      lastPublishedAt: publishedAtRef.current,
      now,
    })) return;
    publishedAtRef.current = now;
    setProgressState(next);
    useBackgroundJobsStore.getState().updateJob(jobId, next);
  }, [jobId]);

  return { progress, updateProgress };
}
