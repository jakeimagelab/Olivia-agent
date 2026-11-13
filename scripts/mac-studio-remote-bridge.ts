#!/usr/bin/env node

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { executeWorkerBuiltIn } from "@/lib/remote-jobs/node/workerBuiltIns";
import {
  createRunnerInvocation,
  type RunnerInvocation,
} from "@/lib/remote-jobs/node/workerRunnerInvocation";
import {
  type WorkerJsonRecord as JsonRecord,
} from "@/lib/remote-jobs/workerPayload";

export { createRunnerInvocation };
export type { RunnerInvocation };

const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
const WORKER_CODE_VERSION = process.env.OLIVIA_WORKER_CODE_VERSION?.trim() || "2026.11.11-person-select-delivery-v1";

export type ClaimedRemoteJob = {
  job_id: string;
  action: string;
  payload: JsonRecord;
};

type RunnerOutcome = {
  exitCode: number;
  result: JsonRecord | null;
  stdout: string;
  stderr: string;
  cancellationRequested?: boolean;
};

type CoalescedProgressReporter = {
  push: (progress: JsonRecord) => void;
  flush: () => Promise<void>;
};

/**
 * Keep progress observational and bounded: at most one HTTP report is in flight,
 * while newer snapshots replace older unsent ones. Terminal job reporting calls
 * flush(), so completion never waits behind one request per processed file.
 */
export function createCoalescedProgressReporter(
  send: (progress: JsonRecord) => Promise<void>,
  options: {
    intervalMs?: number;
    onError?: (error: unknown) => void;
  } = {},
): CoalescedProgressReporter {
  const intervalMs = Math.max(0, options.intervalMs ?? 500);
  const onError = options.onError ?? (() => undefined);
  let pending: JsonRecord | null = null;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastStartedAt = 0;

  const clearScheduled = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const startPending = (): void => {
    if (inFlight || !pending) return;
    const waitMs = Math.max(0, intervalMs - (Date.now() - lastStartedAt));
    if (waitMs > 0) {
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          startPending();
        }, waitMs);
      }
      return;
    }

    const snapshot = pending;
    pending = null;
    lastStartedAt = Date.now();
    inFlight = send(snapshot)
      .catch(onError)
      .finally(() => {
        inFlight = null;
        startPending();
      });
  };

  return {
    push(progress) {
      pending = progress;
      startPending();
    },
    async flush() {
      clearScheduled();
      while (inFlight) await inFlight;
      clearScheduled();
      if (!pending) return;
      const snapshot = pending;
      pending = null;
      lastStartedAt = Date.now();
      await send(snapshot).catch(onError);
      while (inFlight) await inFlight;
    },
  };
}

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

function parseLastJsonObject(stdout: string): JsonRecord | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const candidates = [trimmed, ...trimmed.split(/\r?\n/).reverse()];
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isRecord(parsed)) return parsed;
    } catch {
      // 다음 stdout line을 검사한다.
    }
  }
  return null;
}

function lastLines(value: string, count: number) {
  return value.split(/\r?\n/u).map((line) => line.trimEnd()).filter(Boolean).slice(-count);
}

/** runner 실패 원인을 일반 문구로 덮지 않고 가장 구체적인 값을 선택한다. */
export function resolveRunnerError(outcome: RunnerOutcome): string {
  const resultError = outcome.result?.error;
  if (typeof resultError === "string" && resultError.trim()) return resultError.trim();
  const resultMessage = outcome.result?.message;
  if (typeof resultMessage === "string" && resultMessage.trim()) return resultMessage.trim();
  const stderrLine = outcome.stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(PROGRESS_PREFIX))
    .at(-1);
  if (stderrLine) return stderrLine;
  const stdoutLine = outcome.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
  if (stdoutLine && !outcome.result) return `runner 결과 JSON을 읽지 못했습니다: ${stdoutLine.slice(0, 500)}`;
  return `runner가 종료 코드 ${outcome.exitCode}로 실패했습니다.`;
}

function captureWithLimit(current: string, chunk: Buffer): string {
  const next = current + chunk.toString("utf8");
  if (Buffer.byteLength(next, "utf8") <= MAX_CAPTURE_BYTES) return next;
  throw new Error(`runner 출력이 ${MAX_CAPTURE_BYTES / 1024 / 1024}MB 제한을 초과했습니다.`);
}

function killIgnoringMissing(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function terminateGroup(child: ChildProcess): ReturnType<typeof setTimeout> | null {
  if (!child.pid) return null;
  killIgnoringMissing(-child.pid, "SIGTERM");
  return setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null && child.pid) killIgnoringMissing(-child.pid, "SIGKILL");
  }, 10_000);
}

async function executeRunner(
  invocation: RunnerInvocation,
  onProgress: (progress: JsonRecord) => Promise<void>,
  options: { shouldCancel?: () => Promise<boolean> } = {},
): Promise<RunnerOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...(invocation.killProcessGroup ? { detached: true } : {}),
    });
    let stdout = "";
    let stderr = "";
    let stderrBuffer = "";
    let cancellationRequested = false;
    let cancelCheckRunning = false;
    let cancelTimer: ReturnType<typeof setInterval> | null = null;
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
    const terminate = () => {
      if (invocation.killProcessGroup) {
        forceKillTimer ??= terminateGroup(child);
      } else {
        child.kill("SIGTERM");
      }
    };
    const progressReporter = createCoalescedProgressReporter(onProgress, {
      onError: (error) => {
        console.error(`[remote-bridge] 진행 상태 보고 실패: ${error instanceof Error ? error.message : String(error)}`);
      },
    });

    const processStderrLine = (line: string): void => {
      if (line.startsWith(PROGRESS_PREFIX)) {
        try {
          const parsed: unknown = JSON.parse(line.slice(PROGRESS_PREFIX.length));
          if (!isRecord(parsed)) throw new Error("진행 정보가 JSON object가 아닙니다.");
          progressReporter.push(parsed);
          return;
        } catch (error) {
          console.error(`[remote-bridge] 진행 상태 해석 실패: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (line) console.error(line);
    };

    const checkCancellation = async () => {
      if (cancelCheckRunning || cancellationRequested || !options.shouldCancel) return;
      cancelCheckRunning = true;
      try {
        if (await options.shouldCancel()) {
          cancellationRequested = true;
          terminate();
        }
      } catch (error) {
        // 취소 상태 조회 실패는 작업 실패가 아니다. 다음 500ms polling에서 다시 확인한다.
        console.warn(`[remote-bridge] 취소 상태 확인 실패: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        cancelCheckRunning = false;
      }
    };
    if (options.shouldCancel) {
      cancelTimer = setInterval(() => { void checkCancellation(); }, 500);
      void checkCancellation();
    }

    child.stdout.on("data", (chunk: Buffer) => {
      try {
        stdout = captureWithLimit(stdout, chunk);
      } catch (error) {
        terminate();
        reject(error);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      try {
        stderr = captureWithLimit(stderr, chunk);
        stderrBuffer += chunk.toString("utf8");
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() ?? "";
        for (const line of lines) processStderrLine(line);
      } catch (error) {
        terminate();
        reject(error);
      }
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (cancelTimer) clearInterval(cancelTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (stderrBuffer) processStderrLine(stderrBuffer);
      void progressReporter.flush().then(() => {
        resolve({
          exitCode: code ?? 1,
          result: parseLastJsonObject(stdout),
          stdout,
          stderr,
          cancellationRequested,
        });
      });
    });
  });
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
