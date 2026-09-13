import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";

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
export const REMOTE_PHOTO_SORT_TIMEOUT_MS = 5 * 60_000;

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

function parseRemotePhotoSortJob(body: JsonRecord): RemotePhotoSortJob {
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
  };
}

export async function runRemotePhotoSort(
  input: RemotePhotoSortPayload,
  options: RunRemotePhotoSortOptions = {},
): Promise<RemotePhotoSortJob> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const pollIntervalMs = options.pollIntervalMs ?? REMOTE_PHOTO_SORT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? REMOTE_PHOTO_SORT_TIMEOUT_MS;
  const sourceFolder = normalizeRemoteNasRelativePath(input.source_folder);
  const signal = options.signal;

  if (!sourceFolder) {
    throw new Error("NAS Root가 아닌 촬영 폴더를 선택해주세요.");
  }
  throwIfAborted(signal);

  const createResponse = await fetcher("/api/remote-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "PHOTO_SORT",
      payload: { ...input, source_folder: sourceFolder },
    }),
    signal,
  });
  const createBody = await readJsonResponse(createResponse);
  if (!createResponse.ok) {
    throw new Error(apiErrorMessage(createBody, "Mac Studio 사진 분류 요청에 실패했습니다."));
  }

  const createdJob = parseRemotePhotoSortJob(createBody);
  options.onJob?.(createdJob);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    throwIfAborted(signal);

    const pollResponse = await fetcher(
      `/api/remote-jobs?id=${encodeURIComponent(createdJob.id)}`,
      { method: "GET", cache: "no-store", signal },
    );
    const pollBody = await readJsonResponse(pollResponse);
    if (!pollResponse.ok) {
      throw new Error(apiErrorMessage(pollBody, "Mac Studio 작업 상태를 확인하지 못했습니다."));
    }

    const job = parseRemotePhotoSortJob(pollBody);
    if (job.id !== createdJob.id) throw new Error("다른 사진 분류 작업 상태가 반환되었습니다.");
    options.onJob?.(job);

    if (job.status === "COMPLETED") return job;
    if (job.status === "FAILED") {
      throw new Error(job.error || job.message || "Mac Studio 사진 분류 작업에 실패했습니다.");
    }

    await waitForPolling(Math.max(0, pollIntervalMs), signal);
  }

  throw new Error("Mac Studio 작업 확인 시간이 초과되었습니다. 작업은 Mac Studio에서 계속될 수 있습니다.");
}
