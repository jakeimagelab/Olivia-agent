"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VideoAudioExtractResult, VideoInterviewResult } from "@/lib/video-interview/types";

export type VideoStudioAction = "VIDEO_INTERVIEW_ANALYZE" | "VIDEO_AUDIO_EXTRACT";

export type VideoStudioJob = {
  id: string;
  action: VideoStudioAction;
  payload: { source_relative_path?: string; context?: string } | null;
  status: string;
  progress: { stage?: string; current?: number; total?: number; message?: string } | null;
  message: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export const isActiveJob = (job: Pick<VideoStudioJob, "status"> | null | undefined) => job?.status === "QUEUED" || job?.status === "RUNNING";

export function jobPercent(job: VideoStudioJob): number {
  if (job.status === "COMPLETED") return 100;
  const { current, total } = job.progress ?? {};
  return typeof current === "number" && typeof total === "number" && total > 0 ? Math.round((current / total) * 100) : job.status === "RUNNING" ? 3 : 0;
}

export function jobFolderName(job: VideoStudioJob): string {
  const path = job.payload?.source_relative_path ?? "";
  return (path.split("/").filter(Boolean).at(-1) ?? path).normalize("NFC") || "촬영 폴더";
}

async function readJson(response: Response) {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.ok === false) throw new Error(typeof body.error === "string" ? body.error : `요청 실패 (${response.status})`);
  return body;
}

/** 영상작업실 작업 목록·결과·시작을 한 곳에서 관리한다. 진행 중 작업이 있으면 4초마다 갱신. */
export function useVideoStudioJobs() {
  const [jobs, setJobs] = useState<VideoStudioJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, VideoInterviewResult | VideoAudioExtractResult>>({});
  const loadingResults = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const body = await readJson(await fetch("/api/video-studio/jobs", { cache: "no-store" }));
      setJobs(Array.isArray(body.jobs) ? (body.jobs as VideoStudioJob[]) : []);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "작업 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const hasActive = jobs.some(isActiveJob);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, hasActive ? 4_000 : 30_000);
    return () => clearInterval(timer);
  }, [refresh, hasActive]);

  const loadResult = useCallback(async (jobId: string) => {
    if (results[jobId] || loadingResults.current.has(jobId)) return;
    loadingResults.current.add(jobId);
    try {
      const body = await readJson(await fetch(`/api/remote-jobs?id=${encodeURIComponent(jobId)}`, { cache: "no-store" }));
      const job = body.job as { result?: unknown } | undefined;
      const result = job?.result as VideoInterviewResult | VideoAudioExtractResult | undefined;
      if (result && result.ok) setResults((current) => ({ ...current, [jobId]: result }));
    } finally {
      loadingResults.current.delete(jobId);
    }
  }, [results]);

  const startJob = useCallback(async (action: VideoStudioAction, payload: Record<string, unknown>) => {
    const body = await readJson(await fetch("/api/remote-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }));
    const job = body.job as VideoStudioJob;
    setJobs((current) => [{ ...job, progress: null, message: null, error: null, completed_at: null }, ...current.filter((item) => item.id !== job.id)]);
    void refresh();
    return job.id;
  }, [refresh]);

  return { jobs, loading, error, refresh, results, loadResult, startJob };
}

// ───────── 화면 편집 상태 (채택·구간 조정) — 이 브라우저에만 저장 ─────────

export type ReelEdits = { adopted: Record<number, boolean>; adjusted: Record<number, { start: number; end: number }> };
const EMPTY_EDITS: ReelEdits = { adopted: {}, adjusted: {} };
const editsKey = (jobId: string) => `olivia.video-studio.edits.${jobId}`;
export const EDIT_ROOT_KEY = "olivia.video-studio.edit-root";

export function useReelEdits(jobId: string | null) {
  const [edits, setEdits] = useState<ReelEdits>(EMPTY_EDITS);
  useEffect(() => {
    if (!jobId) return setEdits(EMPTY_EDITS);
    try {
      const stored = JSON.parse(localStorage.getItem(editsKey(jobId)) ?? "null") as ReelEdits | null;
      setEdits(stored && typeof stored === "object" ? { adopted: stored.adopted ?? {}, adjusted: stored.adjusted ?? {} } : EMPTY_EDITS);
    } catch {
      setEdits(EMPTY_EDITS);
    }
  }, [jobId]);
  const update = useCallback((next: (current: ReelEdits) => ReelEdits) => {
    setEdits((current) => {
      const value = next(current);
      if (jobId) {
        try { localStorage.setItem(editsKey(jobId), JSON.stringify(value)); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
      }
      return value;
    });
  }, [jobId]);
  return { edits, update };
}

export function useStoredText(key: string) {
  const [value, setValue] = useState("");
  useEffect(() => {
    try { setValue(localStorage.getItem(key) ?? ""); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
  }, [key]);
  const save = useCallback((next: string) => {
    setValue(next);
    try { localStorage.setItem(key, next); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
  }, [key]);
  return [value, save] as const;
}

export function useInterviewJobs(jobs: VideoStudioJob[]) {
  return useMemo(() => jobs.filter((job) => job.action === "VIDEO_INTERVIEW_ANALYZE"), [jobs]);
}

export function downloadText(fileName: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_").slice(0, 60) || "interview";
}
