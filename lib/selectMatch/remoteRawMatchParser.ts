import type {
  RemoteRawMatchCopyFailure,
  RemoteRawMatchCopyResult,
  RemoteRawMatchCopyWarning,
  RemoteRawMatchJob,
} from "@/lib/selectMatch/remoteRawMatchTypes";

type JsonRecord = Record<string, unknown>;

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELED"]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function remoteRawMatchErrorMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" && value.error.trim()
    ? value.error.trim()
    : fallback;
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
    const stage = entry.stage;
    if (stage !== "raw_copy" && stage !== "jpg_move" && stage !== "xmp_move") {
      throw new Error("Mac Studio RAW 복사 실패 단계가 올바르지 않습니다.");
    }
    return { stage: stage as RemoteRawMatchCopyFailure["stage"], path: entry.path, error: entry.error };
  });
  const warnings = Array.isArray(value.warnings) ? value.warnings.map((entry) => {
    if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.warning !== "string") {
      throw new Error("Mac Studio RAW 복사 경고 목록이 올바르지 않습니다.");
    }
    const stage = entry.stage;
    if (stage !== "raw_copy" && stage !== "jpg_move" && stage !== "xmp_move") {
      throw new Error("Mac Studio RAW 복사 경고 단계가 올바르지 않습니다.");
    }
    return { stage: stage as RemoteRawMatchCopyWarning["stage"], path: entry.path, warning: entry.warning };
  }) : [];
  return {
    ok: true,
    status: "PHOTO_RAW_MATCH_COPY_COMPLETED",
    outputDir: value.outputDir,
    copied: value.copied as number,
    alreadyCopied: typeof value.alreadyCopied === "number" && Number.isInteger(value.alreadyCopied) && value.alreadyCopied >= 0
      ? value.alreadyCopied
      : 0,
    rawMoved: value.rawMoved as number,
    jpgMoved: value.jpgMoved as number,
    xmpMoved: value.xmpMoved as number,
    failed: value.failed as number,
    failures,
    warnings,
    attributePassed: value.attributePassed as number,
    attributeFailed: value.attributeFailed as number,
    logPath: value.logPath,
  };
}

export function parseRemoteRawMatchJob(value: unknown): RemoteRawMatchJob {
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
