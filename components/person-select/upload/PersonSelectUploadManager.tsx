"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPersonSelectDerivatives, type LocalPersonSelectScan, type PersonSelectImportLayout } from "@/lib/person-select/localImport";
import { pendingUploadPaths, type PersonSelectUploadJob } from "@/lib/person-select/uploadQueue";
import { pumpPersonSelectUploadRuntime, type PersonSelectUploadExecutionDependencies } from "@/lib/person-select/uploadExecution";
import {
  createPersonSelectUploadRuntime,
  personSelectUploadManifest,
  resumablePersonSelectUploadPaths,
  type PersonSelectUploadRuntime,
} from "@/lib/person-select/uploadRuntime";
import {
  createPersonSelectUploadJob,
  loadPersonSelectUploadJob,
  loadPersonSelectUploadJobs,
  preparePersonSelectLocalImport,
  updatePersonSelectUploadJob,
  uploadPersonSelectDerivative,
} from "@/lib/person-select/uploadClient";

type StartUploadInput = {
  eventId: string;
  projectTitle: string;
  layout: PersonSelectImportLayout;
  sourceName: string;
  scan: LocalPersonSelectScan;
};

type UploadManagerValue = {
  jobs: PersonSelectUploadJob[];
  startLocalUpload(input: StartUploadInput): Promise<string>;
  reattachLocalFiles(jobId: string, scan: LocalPersonSelectScan): Promise<void>;
  pause(jobId: string): Promise<void>;
  resume(jobId: string): Promise<void>;
  retryFailed(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
  refresh(): Promise<void>;
};

const UploadManagerContext = createContext<UploadManagerValue | null>(null);
export function PersonSelectUploadProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<PersonSelectUploadJob[]>([]);
  const mountedRef = useRef(true);
  const runtimesRef = useRef(new Map<string, PersonSelectUploadRuntime>());

  const mergeJob = useCallback((job: PersonSelectUploadJob) => {
    if (!mountedRef.current) return;
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))));
  }, []);

  const refresh = useCallback(async () => {
    const jobs = await loadPersonSelectUploadJobs();
    if (!jobs || !mountedRef.current) return;
    const runtimeIds = new Set(runtimesRef.current.keys());
    setJobs(jobs.map((job) => {
      const active = ["queued", "uploading", "paused"].includes(job.status);
      if (active && !runtimeIds.has(job.id)) return { ...job, needs_file_reselection: true, active_count: 0 };
      if (active && runtimeIds.has(job.id)) return { ...job, needs_file_reselection: false };
      return job;
    }));
  }, []);

  const patchJob = useCallback(async (job: PersonSelectUploadJob | { id: string; event_id: string }, body: Record<string, unknown>) => {
    const result = await updatePersonSelectUploadJob(job, body);
    mergeJob(result);
    return result;
  }, [mergeJob]);

  const readJobFiles = useCallback(async (eventId: string, jobId: string) => {
    const result = await loadPersonSelectUploadJob(eventId, jobId);
    mergeJob(result.job);
    return result;
  }, [mergeJob]);

  const pump = useCallback(async (jobId: string) => {
    const runtime = runtimesRef.current.get(jobId);
    if (!runtime) return;
    const dependencies: PersonSelectUploadExecutionDependencies = {
      checkpoint: (body) => patchJob({ id: jobId, event_id: runtime.eventId }, body),
      createDerivatives: createPersonSelectDerivatives,
      upload: uploadPersonSelectDerivative,
      delay: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
      onDeferredCheckpoint: (_phase, error) => {
        if (process.env.NODE_ENV !== "production") console.debug("[person-select-upload] failure checkpoint retry", error);
      },
    };
    const started = await pumpPersonSelectUploadRuntime({ jobId, runtime, dependencies });
    if (!started) return;
    try {
      const details = await readJobFiles(runtime.eventId, jobId);
      if (["completed", "partial_failed", "failed", "canceled"].includes(details.job.status)) runtimesRef.current.delete(jobId);
    } catch (checkpointError) {
      // 파일 POST 응답이 성공한 상태이므로 서버 체크포인트는 다음 전역 poll에서 복구한다.
      if (process.env.NODE_ENV !== "production") console.debug("[person-select-upload] final checkpoint refresh deferred", checkpointError);
    }
  }, [patchJob, readJobFiles]);

  const startLocalUpload = useCallback(async (input: StartUploadInput) => {
    if (!input.scan.files.length) throw new Error("올릴 JPG가 없습니다.");
    const manifest = personSelectUploadManifest(input.scan);
    await preparePersonSelectLocalImport(
      input.eventId,
      input.layout,
      manifest.map(({ relativePath, fileName }) => ({ relativePath, fileName })),
    );
    const result = await createPersonSelectUploadJob({
      eventId: input.eventId,
      layout: input.layout,
      sourceName: input.sourceName,
      files: manifest,
    });
    const pending = pendingUploadPaths(input.scan.files, result.completedPaths);
    const runtime = createPersonSelectUploadRuntime({
      eventId: input.eventId,
      layout: input.layout,
      files: input.scan.files,
      queue: pending.map((file) => file.relativePath),
    });
    runtimesRef.current.set(result.job.id, runtime);
    mergeJob(result.job);
    void pump(result.job.id);
    return String(result.job.id);
  }, [mergeJob, pump]);

  const reattachLocalFiles = useCallback(async (jobId: string, scan: LocalPersonSelectScan) => {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("업로드 작업을 찾을 수 없습니다.");
    const details = await readJobFiles(job.event_id, jobId);
    const runtime = createPersonSelectUploadRuntime({ eventId: job.event_id, layout: job.layout, files: scan.files, queue: [] });
    const queue = resumablePersonSelectUploadPaths(details.files, runtime.files);
    if (!queue.length) throw new Error("남은 파일과 일치하는 JPG를 찾지 못했습니다. 같은 원본 폴더를 다시 선택해 주세요.");
    runtime.queue = queue;
    runtimesRef.current.set(jobId, runtime);
    await patchJob(job, { action: "retry_failed" });
    void pump(jobId);
  }, [jobs, patchJob, pump, readJobFiles]);

  const pause = useCallback(async (jobId: string) => {
    const job = jobs.find((item) => item.id === jobId); if (!job) return;
    const runtime = runtimesRef.current.get(jobId); if (runtime) { runtime.paused = true; runtime.controllers.forEach((controller) => controller.abort()); }
    await patchJob(job, { action: "pause" });
  }, [jobs, patchJob]);

  const resume = useCallback(async (jobId: string) => {
    const job = jobs.find((item) => item.id === jobId); if (!job) return;
    const runtime = runtimesRef.current.get(jobId);
    if (!runtime) throw new Error("브라우저가 원본 파일 권한을 잃었습니다. 같은 폴더를 다시 선택해 이어서 올려주세요.");
    runtime.paused = false;
    await patchJob(job, { action: "resume" });
    void pump(jobId);
  }, [jobs, patchJob, pump]);

  const retryFailed = useCallback(async (jobId: string) => {
    const job = jobs.find((item) => item.id === jobId); if (!job) return;
    const runtime = runtimesRef.current.get(jobId);
    if (!runtime) throw new Error("같은 폴더를 다시 선택한 뒤 실패 파일을 이어서 올려주세요.");
    const details = await readJobFiles(job.event_id, jobId);
    runtime.queue.push(...details.files.filter((file) => file.status === "failed" && runtime.files.has(file.relative_path)).map((file) => file.relative_path));
    runtime.paused = false;
    await patchJob(job, { action: "retry_failed" });
    void pump(jobId);
  }, [jobs, patchJob, pump, readJobFiles]);

  const cancel = useCallback(async (jobId: string) => {
    const job = jobs.find((item) => item.id === jobId); if (!job) return;
    const runtime = runtimesRef.current.get(jobId); if (runtime) { runtime.canceled = true; runtime.controllers.forEach((controller) => controller.abort()); }
    await patchJob(job, { action: "cancel" });
    runtimesRef.current.delete(jobId);
  }, [jobs, patchJob]);

  useEffect(() => {
    mountedRef.current = true;
    let refreshInFlight = false;
    const refreshVisible = async () => {
      if (document.visibilityState !== "visible" || refreshInFlight) return;
      refreshInFlight = true;
      try { await refresh(); } finally { refreshInFlight = false; }
    };
    const resume = () => { if (document.visibilityState === "visible") void refreshVisible(); };
    void refreshVisible();
    const timer = window.setInterval(() => void refreshVisible(), 8_000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [refresh]);

  const value = useMemo<UploadManagerValue>(() => ({ jobs, startLocalUpload, reattachLocalFiles, pause, resume, retryFailed, cancel, refresh }), [cancel, jobs, pause, reattachLocalFiles, refresh, resume, retryFailed, startLocalUpload]);
  return <UploadManagerContext.Provider value={value}>{children}</UploadManagerContext.Provider>;
}

export function usePersonSelectUploadManager() {
  const value = useContext(UploadManagerContext);
  if (!value) throw new Error("PersonSelectUploadProvider가 필요합니다.");
  return value;
}
