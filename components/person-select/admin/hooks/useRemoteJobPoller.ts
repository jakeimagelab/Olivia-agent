"use client";

import { useEffect, useRef } from "react";
import { readApiResponse } from "@/lib/http/apiResponse";

export type RemoteJobPollResult = {
  status?: string;
  result?: Record<string, unknown> | null;
  error?: string;
  message?: string;
};

const TERMINAL_REMOTE_JOB_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELED"]);

export function isRemoteJobTerminalStatus(status: string | null | undefined) {
  return Boolean(status && TERMINAL_REMOTE_JOB_STATUSES.has(status));
}

export function resolveRemoteJobResult(job: RemoteJobPollResult, fallbackError = "원격 작업에 실패했습니다.") {
  return job.result || { error: job.error || job.message || fallbackError };
}

export function useRemoteJobPoller({ jobId, label, onTerminal, intervalMs = 2_500 }: {
  jobId: string;
  label: string;
  onTerminal: (job: RemoteJobPollResult) => void | Promise<void>;
  intervalMs?: number;
}) {
  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let inFlight = false;

    const poll = async () => {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch(`/api/remote-jobs?id=${jobId}`, { cache: "no-store" });
        const body = await readApiResponse<{ job?: RemoteJobPollResult }>(response, label);
        if (!body.job || !isRemoteJobTerminalStatus(body.job.status) || stopped) return;
        await onTerminalRef.current(body.job);
      } catch {
        // 일시적인 네트워크 오류는 다음 가시 상태 폴링에서 복구한다.
      } finally {
        inFlight = false;
      }
    };

    const resume = () => { if (document.visibilityState === "visible") void poll(); };
    void poll();
    const timer = window.setInterval(() => void poll(), intervalMs);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [intervalMs, jobId, label]);
}
