import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";
import {
  parseRemoteJobProgress,
  type RemoteJobProgress,
} from "@/lib/remote-jobs/progress";

export type RemotePhotoSortJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type RemotePhotoSortPayload = {
  source_folder: string;
  shooting_mode: "field" | "studio";
  department: string;
  gap_minutes: number;
  classification_ui_mode: "ai-auto" | "advanced";
  fast_analyze_mode: boolean;
  department_logic_enabled: boolean;
  ai_naming_enabled: boolean;
  quality_analysis_enabled: boolean;
  profile_classification_enabled: boolean;
};

export type RemotePhotoSortJob = {
  id: string;
  action: "PHOTO_SORT";
  status: RemotePhotoSortJobStatus;
  result: unknown;
  message: string | null;
  error: string | null;
  progress: RemoteJobProgress | null;
};

type JsonRecord = Record<string, unknown>;

export type RunRemotePhotoSortOptions = {
  signal?: AbortSignal;
  onJob?: (job: RemotePhotoSortJob) => void;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export const REMOTE_PHOTO_SORT_POLL_INTERVAL_MS = 1_000;
export const REMOTE_PHOTO_SORT_TIMEOUT_MS = 60 * 60_000;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createAbortError(): DOMException {
  return new DOMException("요청이 취소되었습니다.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function waitForPolling(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (delayMs <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function readJsonResponse(response: Response): Promise<JsonRecord> {
  const body: unknown = await response.json().catch(() => ({}));
  return isRecord(body) ? body : {};
}

function apiErrorMessage(body: JsonRecord, fallback: string): string {
  return typeof body.error === "string" && body.error.trim() ? body.error : fallback;
}

export function parseRemotePhotoSortJob(body: JsonRecord): RemotePhotoSortJob {
  const value = body.job;
  if (!isRecord(value)) throw new Error("Mac Studio 작업 정보를 읽지 못했습니다.");

  const status = typeof value.status === "string" ? value.status.toUpperCase() : "";
  if (!["QUEUED", "RUNNING", "COMPLETED", "FAILED"].includes(status)) {
    throw new Error("Mac Studio 작업 상태를 읽지 못했습니다.");
  }
  if (typeof value.id !== "string" || !value.id) {
    throw new Error("Mac Studio 작업 ID를 읽지 못했습니다.");
  }
  if (typeof value.action === "string" && value.action && value.action !== "PHOTO_SORT") {
    throw new Error("요청한 사진 분류 작업과 다른 결과가 반환되었습니다.");
  }

  return {
    id: value.id,
    action: "PHOTO_SORT",
    status: status as RemotePhotoSortJobStatus,
    result: value.result,
    message: typeof value.message === "string" ? value.message : null,
    error: typeof value.error === "string" ? value.error : null,
    progress: parseRemoteJobProgress(value.progress),
  };
}

export type RemotePhotoSortRequestOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

export async function createRemotePhotoSortJob(
  input: RemotePhotoSortPayload,
  options: RemotePhotoSortRequestOptions = {},
): Promise<RemotePhotoSortJob> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const sourceFolder = normalizeRemoteNasRelativePath(input.source_folder);

  if (!sourceFolder) {
    throw new Error("NAS Root가 아닌 촬영 폴더를 선택해주세요.");
  }
  throwIfAborted(options.signal);

  const response = await fetcher("/api/remote-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "PHOTO_SORT",
      payload: { ...input, source_folder: sourceFolder },
    }),
    signal: options.signal,
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(body, "Mac Studio 사진 분류 요청에 실패했습니다."));
  }
  return parseRemotePhotoSortJob(body);
}

export async function getRemotePhotoSortJob(
  jobId: string,
  options: RemotePhotoSortRequestOptions = {},
): Promise<RemotePhotoSortJob> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  throwIfAborted(options.signal);

  const response = await fetcher(
    `/api/remote-jobs?id=${encodeURIComponent(jobId)}`,
    { method: "GET", cache: "no-store", signal: options.signal },
  );
  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(body, "Mac Studio 작업 상태를 확인하지 못했습니다."));
  }

  const job = parseRemotePhotoSortJob(body);
  if (job.id !== jobId) throw new Error("다른 사진 분류 작업 상태가 반환되었습니다.");
  return job;
}

export async function runRemotePhotoSort(
  input: RemotePhotoSortPayload,
  options: RunRemotePhotoSortOptions = {},
): Promise<RemotePhotoSortJob> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const pollIntervalMs = options.pollIntervalMs ?? REMOTE_PHOTO_SORT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? REMOTE_PHOTO_SORT_TIMEOUT_MS;
  const signal = options.signal;
  const createdJob = await createRemotePhotoSortJob(input, { fetcher, signal });
  options.onJob?.(createdJob);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    throwIfAborted(signal);

    const job = await getRemotePhotoSortJob(createdJob.id, { fetcher, signal });
    options.onJob?.(job);

    if (job.status === "COMPLETED") return job;
    if (job.status === "FAILED") {
      throw new Error(job.error || job.message || "Mac Studio 사진 분류 작업에 실패했습니다.");
    }

    await waitForPolling(Math.max(0, pollIntervalMs), signal);
  }

  // 호출자가 이 예외를 작업 실패로 취급해서는 안 된다. 장시간 작업은 서버에서 계속된다.
  throw new Error("Mac Studio에서 작업은 계속 진행 중입니다. 잠시 후 상태를 다시 확인해주세요.");
}
