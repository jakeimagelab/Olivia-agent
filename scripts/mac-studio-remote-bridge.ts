#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { executeWorkerBuiltIn } from "@/lib/remote-jobs/node/workerBuiltIns";
import {
  createRunnerInvocation,
  type RunnerInvocation,
} from "@/lib/remote-jobs/node/workerRunnerInvocation";
import {
  executeRunner,
  resolveRunnerError,
} from "@/lib/remote-jobs/node/workerRunnerProcess";
import {
  type WorkerJsonRecord as JsonRecord,
} from "@/lib/remote-jobs/workerPayload";
import { createCoalescedProgressReporter } from "@/lib/remote-jobs/workerProgressReporter";

export { createRunnerInvocation };
export type { RunnerInvocation };
export { createCoalescedProgressReporter };
export { resolveRunnerError };

const WORKER_CODE_VERSION = process.env.OLIVIA_WORKER_CODE_VERSION?.trim() || "2026.11.11-person-select-delivery-v1";

export type ClaimedRemoteJob = {
  job_id: string;
  action: string;
  payload: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseClaimedJob(value: unknown): ClaimedRemoteJob | null {
  if (!isRecord(value)) throw new Error("Worker job 응답은 JSON object여야 합니다.");
  if (!value.job_id && !value.action) return null;
  if (typeof value.job_id !== "string" || !value.job_id.trim()) throw new Error("job_id가 없습니다.");
  if (typeof value.action !== "string" || !value.action.trim()) throw new Error("action이 없습니다.");
  if (value.payload !== undefined && !isRecord(value.payload)) throw new Error("payload는 JSON object여야 합니다.");
  return {
    job_id: value.job_id.trim(),
    action: value.action.trim().toUpperCase(),
    payload: isRecord(value.payload) ? value.payload : {},
  };
}

function lastLines(value: string, count: number) {
  return value.split(/\r?\n/u).map((line) => line.trimEnd()).filter(Boolean).slice(-count);
}

function configuredBaseUrl(): string {
  const value = process.env.REMOTE_API_BASE?.trim() || process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!value) throw new Error("REMOTE_API_BASE가 설정되어 있지 않습니다.");
  return value.replace(/\/+$/, "");
}

function configuredWorkerId(): string {
  return process.env.OLIVIA_WORKER_ID?.trim() || process.env.WORKER_ID?.trim() || "jake-macstudio-01";
}

function configuredWorkerToken(): string {
  const value = process.env.OLIVIA_WORKER_TOKEN?.trim() || process.env.WORKER_TOKEN?.trim();
  if (!value) throw new Error("OLIVIA_WORKER_TOKEN이 설정되어 있지 않습니다.");
  return value;
}

async function reportJob(jobId: string, body: JsonRecord): Promise<void> {
  const response = await fetch(`${configuredBaseUrl()}/api/worker/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${configuredWorkerToken()}`,
      "x-olivia-worker": configuredWorkerId(),
      ...(process.env.VERCEL_BYPASS_SECRET?.trim()
        ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_SECRET.trim() }
        : {}),
    },
    body: JSON.stringify({ job_id: jobId, ...body }),
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(`작업 상태 보고 실패 (${response.status})${responseBody ? `: ${responseBody.slice(0, 1000)}` : ""}`);
  }
}

/** Worker가 실행 중인 자기 job의 취소 요청만 읽는다. */
async function isCancellationRequested(jobId: string): Promise<boolean> {
  const response = await fetch(`${configuredBaseUrl()}/api/worker/cancel-request?job_id=${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${configuredWorkerToken()}`,
      "x-olivia-worker": configuredWorkerId(),
      ...(process.env.VERCEL_BYPASS_SECRET?.trim()
        ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_SECRET.trim() }
        : {}),
    },
  });
  if (!response.ok) return false;
  const body: unknown = await response.json().catch(() => ({}));
  return Boolean(body && typeof body === "object" && (body as { cancelRequested?: unknown }).cancelRequested === true);
}

export async function runClaimedJob(job: ClaimedRemoteJob, repoRoot: string): Promise<boolean> {
  // 파일 단위 경계에서 멈출 수 있는 작업만 취소 요청을 확인한다.
  // 기존 Worker action의 HTTP 계약에는 추가 요청을 끼워 넣지 않아 회귀를 막는다.
  const supportsSafeCancellation = job.action === "PHOTO_SORT" || job.action === "PHOTO_RAW_MATCH_COPY";
  if (supportsSafeCancellation && await isCancellationRequested(job.job_id)) {
    await reportJob(job.job_id, { status: "CANCELED", message: "사용자 취소 요청으로 작업을 시작하지 않았습니다." });
    return true;
  }
  await reportJob(job.job_id, { status: "RUNNING", message: `${job.action} 실행 중` });
  try {
    const invocation = createRunnerInvocation(job, repoRoot);
    if (!invocation) {
      const result = await executeWorkerBuiltIn(job, {
        workerId: configuredWorkerId(),
        onProgress: (progress) => reportJob(job.job_id, { status: "RUNNING", progress }),
        ...(supportsSafeCancellation ? { shouldCancel: () => isCancellationRequested(job.job_id) } : {}),
      });
      await reportJob(job.job_id, { status: "COMPLETED", result, message: `${job.action} 완료` });
      return true;
    }

    const outcome = await executeRunner(invocation, async (progress) => {
      await reportJob(job.job_id, { status: "RUNNING", progress });
    }, supportsSafeCancellation ? { shouldCancel: () => isCancellationRequested(job.job_id) } : undefined);
    if (outcome.cancellationRequested) {
      await reportJob(job.job_id, {
        status: "CANCELED",
        message: "작업을 안전하게 취소했습니다. NAS 원본은 변경되지 않았습니다.",
      });
      return true;
    }
    const successful = outcome.exitCode === 0 && outcome.result?.ok !== false;
    if (!successful) {
      const error = resolveRunnerError(outcome);
      const diagnostics = {
        stderrLast40: lastLines(outcome.stderr, 40),
        stdoutLast20: lastLines(outcome.stdout, 20),
        exitCode: outcome.exitCode,
        workerCodeVersion: WORKER_CODE_VERSION,
      };
      await reportJob(job.job_id, {
        status: "FAILED",
        error,
        message: error,
        result: { ...(outcome.result ?? {}), diagnostics },
      });
      console.error(`[remote-bridge] ${job.action} 실패: ${error}`);
      return false;
    }

    const result: JsonRecord = {
      ...(outcome.result ?? { ok: true, stdout: outcome.stdout.trim() }),
      workerCodeVersion: typeof outcome.result?.workerCodeVersion === "string"
        ? outcome.result.workerCodeVersion
        : WORKER_CODE_VERSION,
    };
    await reportJob(job.job_id, {
      status: "COMPLETED",
      result,
      message: typeof result.status === "string" ? result.status : `${job.action} 완료`,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await reportJob(job.job_id, { status: "FAILED", error: message, message }).catch((reportError: unknown) => {
      throw new Error(`${message}; 실패 상태 보고도 실패했습니다: ${reportError instanceof Error ? reportError.message : String(reportError)}`);
    });
    console.error(`[remote-bridge] ${job.action} 실패: ${message}`);
    return false;
  }
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const jobFile = argumentValue("--job-file");
  if (!jobFile) throw new Error("--job-file이 필요합니다.");
  const raw = await readFile(jobFile, "utf8");
  const job = parseClaimedJob(JSON.parse(raw));
  if (!job) {
    process.exitCode = 3;
    return;
  }
  const repoRoot = path.resolve(argumentValue("--repo-root") || process.env.OLIVIA_REPO_ROOT || process.cwd());
  const succeeded = await runClaimedJob(job, repoRoot);
  if (!succeeded) process.exitCode = 1;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(`[remote-bridge] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
