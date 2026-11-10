export type RemoteRawMatchLogResult = "확정" | "수동선택" | "건너뜀";

export type RemoteRawMatchCopyItem = {
  rawPath: string;
  destDir: string;
  rawAction?: "copy" | "move";
  rawExpectedSize: number;
  rawExpectedCaptureTimeMs: number | null;
  jpgPath?: string;
  jpgDestDir?: string;
  jpgExpectedSize?: number;
  jpgExpectedCaptureTimeMs?: number | null;
};

export type RemoteRawMatchLogRow = {
  jpgName: string;
  jpgPath: string;
  jpgCaptureTime: string;
  rawPath: string;
  rawCaptureTime: string;
  result: RemoteRawMatchLogResult;
};

export type RemoteRawMatchCopyPayload = {
  rawRootPath: string;
  jpgRootPath?: string;
  items: RemoteRawMatchCopyItem[];
  logRows: RemoteRawMatchLogRow[];
  openOutput?: boolean;
};

export type RemoteRawMatchCopyFailure = {
  path: string;
  error: string;
};

export type RemoteRawMatchCopyResult = {
  ok: true;
  status: "PHOTO_RAW_MATCH_COPY_COMPLETED";
  outputDir: string;
  copied: number;
  rawMoved: number;
  jpgMoved: number;
  xmpMoved: number;
  failed: number;
  failures: RemoteRawMatchCopyFailure[];
  attributePassed: number;
  attributeFailed: number;
  logPath: string;
};

type JsonRecord = Record<string, unknown>;

export type RemoteRawMatchJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
  result: RemoteRawMatchCopyResult | null;
  message: string | null;
  error: string | null;
  progress: { current: number; total: number; message: string } | null;
};

export type RunRemoteRawMatchOptions = {
  workerOnline: boolean | null;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onJob?: (job: RemoteRawMatchJob) => void;
};

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELED"]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function message(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" && value.error.trim()
    ? value.error.trim()
    : fallback;
}

function abortError(): DOMException {
  return new DOMException("작업이 취소되었습니다.", "AbortError");
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

function parseResult(value: unknown): RemoteRawMatchCopyResult | null {
  if (!isRecord(value) || value.ok !== true || value.status !== "PHOTO_RAW_MATCH_COPY_COMPLETED") return null;
  const numericKeys = ["copied", "rawMoved", "jpgMoved", "xmpMoved", "failed", "attributePassed", "attributeFailed"] as const;
  for (const key of numericKeys) {
    if (typeof value[key] !== "number" || !Number.isInteger(value[key]) || value[key] < 0) {
      throw new Error("Mac Studio RAW 복사 결과가 올바르지 않습니다.");
    }
  }
  if (typeof value.outputDir !== "string" || typeof value.logPath !== "string" || !Array.isArray(value.failures)) {
    throw new Error("Mac Studio RAW 복사 결과가 올바르지 않습니다.");
  }
  const failures = value.failures.map((entry) => {
    if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.error !== "string") {
      throw new Error("Mac Studio RAW 복사 실패 목록이 올바르지 않습니다.");
    }
    return { path: entry.path, error: entry.error };
  });
  return {
    ok: true,
    status: "PHOTO_RAW_MATCH_COPY_COMPLETED",
    outputDir: value.outputDir,
    copied: value.copied as number,
    rawMoved: value.rawMoved as number,
    jpgMoved: value.jpgMoved as number,
    xmpMoved: value.xmpMoved as number,
    failed: value.failed as number,
    failures,
    attributePassed: value.attributePassed as number,
    attributeFailed: value.attributeFailed as number,
    logPath: value.logPath,
  };
}

function parseJob(value: unknown): RemoteRawMatchJob {
  if (!isRecord(value) || !isRecord(value.job)) throw new Error("Mac Studio RAW 복사 작업 정보를 읽지 못했습니다.");
  const job = value.job;
  const status = typeof job.status === "string" ? job.status.toUpperCase() : "";
  if (!TERMINAL_STATUSES.has(status) && status !== "QUEUED" && status !== "RUNNING") {
    throw new Error("Mac Studio RAW 복사 상태를 읽지 못했습니다.");
  }
  if (typeof job.id !== "string" || !job.id) throw new Error("Mac Studio RAW 복사 작업 ID가 없습니다.");
  if (typeof job.action === "string" && job.action !== "PHOTO_RAW_MATCH_COPY") {
    throw new Error("다른 Mac Studio 작업 결과가 반환되었습니다.");
  }
  const progress = isRecord(job.progress)
    && typeof job.progress.current === "number"
    && typeof job.progress.total === "number"
    ? {
        current: Math.max(0, Math.trunc(job.progress.current)),
        total: Math.max(0, Math.trunc(job.progress.total)),
        message: typeof job.progress.message === "string" ? job.progress.message : "Mac Studio에서 파일을 처리하고 있습니다.",
      }
    : null;
  return {
    id: job.id,
    status: status as RemoteRawMatchJob["status"],
    result: parseResult(job.result),
    message: typeof job.message === "string" ? job.message : null,
    error: typeof job.error === "string" ? job.error : null,
    progress,
  };
}

export function remoteRawMatchUnavailableReason(workerOnline: boolean | null): string | null {
  return workerOnline === true ? null : "맥스튜디오 워커가 꺼져 있어 원본 속성을 지킬 수 없습니다";
}

export async function runRemoteRawMatchCopy(
  payload: RemoteRawMatchCopyPayload,
  options: RunRemoteRawMatchOptions,
): Promise<RemoteRawMatchCopyResult> {
  const unavailableReason = remoteRawMatchUnavailableReason(options.workerOnline);
  if (unavailableReason) throw new Error(unavailableReason);
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const signal = options.signal;
  if (signal?.aborted) throw abortError();
  const createdResponse = await fetcher("/api/remote-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "PHOTO_RAW_MATCH_COPY", payload }),
    signal,
  });
  const createdBody: unknown = await createdResponse.json().catch(() => ({}));
  if (!createdResponse.ok) throw new Error(message(createdBody, "Mac Studio RAW 복사 작업을 만들지 못했습니다."));
  const created = parseJob(createdBody);
  options.onJob?.(created);

  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 60 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw abortError();
    const response = await fetcher(`/api/remote-jobs?id=${encodeURIComponent(created.id)}`, {
      method: "GET",
      cache: "no-store",
      signal,
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(message(body, "Mac Studio RAW 복사 상태를 확인하지 못했습니다."));
    const job = parseJob(body);
    options.onJob?.(job);
    if (job.status === "COMPLETED") {
      if (!job.result) throw new Error("Mac Studio RAW 복사 결과가 없습니다.");
      return job.result;
    }
    if (job.status === "FAILED" || job.status === "CANCELED") {
      throw new Error(job.error || job.message || "Mac Studio RAW 복사 작업에 실패했습니다.");
    }
    await wait(pollIntervalMs, signal);
  }
  throw new Error("Mac Studio에서 RAW 복사 작업은 계속 진행 중입니다. 잠시 후 다시 확인해 주세요.");
}
