"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPersonSelectDerivatives, type LocalPersonSelectCandidate, type LocalPersonSelectScan, type PersonSelectImportLayout } from "@/lib/person-select/localImport";
import { pendingUploadPaths, uploadFileIdempotencyKey, type PersonSelectUploadJob, type UploadManifestFile } from "@/lib/person-select/uploadQueue";

type StartUploadInput = {
  eventId: string;
  projectTitle: string;
  layout: PersonSelectImportLayout;
  sourceName: string;
  scan: LocalPersonSelectScan;
};

type RuntimeJob = {
  eventId: string;
  layout: PersonSelectImportLayout;
  files: Map<string, LocalPersonSelectCandidate>;
  queue: string[];
  attempts: Map<string, number>;
  paused: boolean;
  canceled: boolean;
  pumping: boolean;
  controllers: Set<AbortController>;
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
const CONCURRENCY = 3;
const MAX_RETRIES = 2;
type UploadJobFileResponse = { relative_path: string; file_size: number; last_modified: number; status: string };
type UploadJsonBody = {
  ok?: boolean;
  error?: string;
  job?: PersonSelectUploadJob;
  jobs?: PersonSelectUploadJob[];
  files?: UploadJobFileResponse[];
  completedPaths?: unknown[];
};

function manifestFor(scan: LocalPersonSelectScan): UploadManifestFile[] {
  return scan.files.map((candidate) => {
    const base = { relativePath: candidate.relativePath, fileName: candidate.fileName, size: candidate.file.size, lastModified: candidate.file.lastModified };
    return { ...base, idempotencyKey: uploadFileIdempotencyKey(base) };
  });
}

async function readJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<UploadJsonBody>;
}

export function PersonSelectUploadProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<PersonSelectUploadJob[]>([]);
  const mountedRef = useRef(true);
  const runtimesRef = useRef(new Map<string, RuntimeJob>());

  const mergeJob = useCallback((job: PersonSelectUploadJob) => {
    if (!mountedRef.current) return;
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))));
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/person-select/upload-jobs?limit=20", { cache: "no-store" });
    const body = await readJson(response);
    if (!response.ok || !body.ok || !mountedRef.current) return;
    const runtimeIds = new Set(runtimesRef.current.keys());
    setJobs((body.jobs ?? []).map((job) => {
      const active = ["queued", "uploading", "paused"].includes(job.status);
      if (active && !runtimeIds.has(job.id)) return { ...job, needs_file_reselection: true, active_count: 0 };
      if (active && runtimeIds.has(job.id)) return { ...job, needs_file_reselection: false };
      return job;
    }));
  }, []);

  const patchJob = useCallback(async (job: PersonSelectUploadJob | { id: string; event_id: string }, body: Record<string, unknown>) => {
    const response = await fetch(`/api/person-select/${job.event_id}/upload-jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await readJson(response);
    if (!response.ok || !result.ok) throw new Error(result.error || "업로드 상태를 저장하지 못했습니다.");
    if (result.job) mergeJob(result.job as PersonSelectUploadJob);
    return result.job as PersonSelectUploadJob;
  }, [mergeJob]);

  const readJobFiles = useCallback(async (eventId: string, jobId: string) => {
    const response = await fetch(`/api/person-select/${eventId}/upload-jobs/${jobId}`, { cache: "no-store" });
    const body = await readJson(response);
    if (!response.ok || !body.ok) throw new Error(body.error || "업로드 작업을 불러오지 못했습니다.");
    if (body.job) mergeJob(body.job as PersonSelectUploadJob);
    return { job: body.job as PersonSelectUploadJob, files: body.files ?? [] };
  }, [mergeJob]);

  const uploadOne = useCallback(async (jobId: string, runtime: RuntimeJob, relativePath: string) => {
    const candidate = runtime.files.get(relativePath);
    if (!candidate) return;
    const attempt = (runtime.attempts.get(relativePath) ?? 0) + 1;
    runtime.attempts.set(relativePath, attempt);
    const controller = new AbortController();
    runtime.controllers.add(controller);
    try {
      await patchJob({ id: jobId, event_id: runtime.eventId }, { action: "file_uploading", relativePath, attempts: attempt });
      const derivative = await createPersonSelectDerivatives(candidate.file);
      if (runtime.paused || runtime.canceled || controller.signal.aborted) {
        if (runtime.paused && !runtime.canceled && !runtime.queue.includes(relativePath)) runtime.queue.unshift(relativePath);
        return;
      }
      const form = new FormData();
      form.set("layout", runtime.layout);
      form.set("relativePath", candidate.relativePath);
      form.set("sortOrder", String(Math.max(0, [...runtime.files.keys()].indexOf(relativePath))));
      form.set("sourceWidth", String(derivative.sourceWidth));
      form.set("sourceHeight", String(derivative.sourceHeight));
      form.set("uploadJobId", jobId);
      form.set("thumb", derivative.thumb, `${candidate.fileName}.thumb.jpg`);
      form.set("preview", derivative.preview, `${candidate.fileName}.preview.jpg`);
      const response = await fetch(`/api/person-select/${runtime.eventId}/local-import`, { method: "POST", body: form, signal: controller.signal });
      const body = await readJson(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "업로드 실패");
    } catch (error) {
      if (controller.signal.aborted || runtime.paused || runtime.canceled) {
        if (runtime.paused && !runtime.canceled) runtime.queue.unshift(relativePath);
        return;
      }
      if (attempt <= MAX_RETRIES) {
        await new Promise((resolve) => window.setTimeout(resolve, 350 * attempt));
        if (!runtime.canceled && !runtime.queue.includes(relativePath)) {
          if (runtime.paused) runtime.queue.unshift(relativePath);
          else runtime.queue.push(relativePath);
        }
        return;
      }
      try {
        await patchJob({ id: jobId, event_id: runtime.eventId }, { action: "file_failed", relativePath, attempts: attempt, error: error instanceof Error ? error.message : "업로드 실패" });
      } catch (checkpointError) {
        // 서버에 실패 체크포인트를 남기지 못한 경우 파일을 잃지 않고 다음 네트워크 복구 때 다시 시도한다.
        if (!runtime.queue.includes(relativePath)) runtime.queue.push(relativePath);
        if (process.env.NODE_ENV !== "production") console.debug("[person-select-upload] failure checkpoint retry", checkpointError);
      }
    } finally {
      runtime.controllers.delete(controller);
    }
  }, [patchJob]);

  const pump = useCallback(async (jobId: string) => {
    const runtime = runtimesRef.current.get(jobId);
    if (!runtime || runtime.pumping || runtime.paused || runtime.canceled) return;
    runtime.pumping = true;
    try {
      const worker = async () => {
        while (!runtime.paused && !runtime.canceled) {
          const relativePath = runtime.queue.shift();
          if (!relativePath) return;
          await uploadOne(jobId, runtime, relativePath);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, runtime.queue.length)) }, () => worker()));
      try {
        const details = await readJobFiles(runtime.eventId, jobId);
        if (["completed", "partial_failed", "failed", "canceled"].includes(details.job.status)) runtimesRef.current.delete(jobId);
      } catch (checkpointError) {
        // 파일 POST 응답이 성공한 상태이므로 서버 체크포인트는 다음 전역 poll에서 복구한다.
        if (process.env.NODE_ENV !== "production") console.debug("[person-select-upload] final checkpoint refresh deferred", checkpointError);
      }
    } finally {
      runtime.pumping = false;
    }
  }, [readJobFiles, uploadOne]);

  const startLocalUpload = useCallback(async (input: StartUploadInput) => {
    if (!input.scan.files.length) throw new Error("올릴 JPG가 없습니다.");
    const manifest = manifestFor(input.scan);
    const prepareResponse = await fetch(`/api/person-select/${input.eventId}/local-import`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: input.layout, files: manifest.map(({ relativePath, fileName }) => ({ relativePath, fileName })) }),
    });
    const prepared = await readJson(prepareResponse);
    if (!prepareResponse.ok || !prepared.ok) throw new Error(prepared.error || "사진 업로드를 준비하지 못했습니다.");
    const jobResponse = await fetch(`/api/person-select/${input.eventId}/upload-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: input.layout, sourceName: input.sourceName, files: manifest }),
    });
    const result = await readJson(jobResponse);
    if (!jobResponse.ok || !result.ok || !result.job) throw new Error(result.error || "업로드 작업을 만들지 못했습니다.");
    const completedPaths = Array.isArray(result.completedPaths) ? result.completedPaths.map(String) : [];
    const pending = pendingUploadPaths(input.scan.files, completedPaths);
    const runtime: RuntimeJob = {
      eventId: input.eventId,
      layout: input.layout,
      files: new Map(input.scan.files.map((file) => [file.relativePath, file])),
      queue: pending.map((file) => file.relativePath),
      attempts: new Map(),
      paused: false,
      canceled: false,
      pumping: false,
      controllers: new Set(),
    };
    runtimesRef.current.set(result.job.id, runtime);
    mergeJob(result.job as PersonSelectUploadJob);
    void pump(result.job.id);
    return String(result.job.id);
  }, [mergeJob, pump]);

  const reattachLocalFiles = useCallback(async (jobId: string, scan: LocalPersonSelectScan) => {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("업로드 작업을 찾을 수 없습니다.");
    const details = await readJobFiles(job.event_id, jobId);
    const available = new Map(scan.files.map((file) => [file.relativePath, file]));
    const pendingRows = details.files.filter((file) => file.status === "pending" || file.status === "failed" || file.status === "uploading");
    const queue = pendingRows.filter((file) => {
      const selected = available.get(file.relative_path);
      return selected && selected.file.size === Number(file.file_size) && selected.file.lastModified === Number(file.last_modified);
    }).map((file) => file.relative_path);
    if (!queue.length) throw new Error("남은 파일과 일치하는 JPG를 찾지 못했습니다. 같은 원본 폴더를 다시 선택해 주세요.");
    const runtime: RuntimeJob = { eventId: job.event_id, layout: job.layout, files: available, queue, attempts: new Map(), paused: false, canceled: false, pumping: false, controllers: new Set() };
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
    void refresh();
    const timer = window.setInterval(() => void refresh(), document.visibilityState === "visible" ? 8_000 : 30_000);
    return () => { mountedRef.current = false; window.clearInterval(timer); };
  }, [refresh]);

  const value = useMemo<UploadManagerValue>(() => ({ jobs, startLocalUpload, reattachLocalFiles, pause, resume, retryFailed, cancel, refresh }), [cancel, jobs, pause, reattachLocalFiles, refresh, resume, retryFailed, startLocalUpload]);
  return <UploadManagerContext.Provider value={value}>{children}</UploadManagerContext.Provider>;
}

export function usePersonSelectUploadManager() {
  const value = useContext(UploadManagerContext);
  if (!value) throw new Error("PersonSelectUploadProvider가 필요합니다.");
  return value;
}
