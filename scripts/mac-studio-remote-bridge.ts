#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  normalizeRemoteNasRelativePath,
  toRemoteNasDisplayPath,
} from "@/lib/remote-nas/path";
import { REMOTE_NAS_ROOT_NAME } from "@/lib/remote-nas/types";

const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

export type ClaimedRemoteJob = {
  job_id: string;
  action: string;
  payload: JsonRecord;
};

export type RunnerInvocation = {
  command: string;
  args: string[];
  cwd: string;
};

type RunnerOutcome = {
  exitCode: number;
  result: JsonRecord | null;
  stdout: string;
  stderr: string;
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

function stringValue(payload: JsonRecord, key: string, required = false): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${key} 값이 필요합니다.`);
    return undefined;
  }
  if (typeof value !== "string") throw new Error(`${key} 값은 문자열이어야 합니다.`);
  return value;
}

function numberValue(payload: JsonRecord, key: string): number | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} 값은 숫자여야 합니다.`);
  return value;
}

function booleanValue(payload: JsonRecord, key: string): boolean | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} 값은 boolean이어야 합니다.`);
  return value;
}

function arrayValue(payload: JsonRecord, key: string): string[] | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${key} 값은 문자열 배열이어야 합니다.`);
  }
  return value;
}

function addString(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined) args.push(flag, value);
}

function addNumber(args: string[], flag: string, value: number | undefined): void {
  if (value !== undefined) args.push(flag, String(value));
}

function addBoolean(args: string[], flag: string, value: boolean | undefined): void {
  if (value !== undefined) args.push(flag, String(value));
}

function runner(repoRoot: string, scriptName: string, args: string[]): RunnerInvocation {
  return {
    command: process.execPath,
    args: ["--import", "tsx", path.join(repoRoot, "scripts", scriptName), ...args],
    cwd: repoRoot,
  };
}

/** 서버 job payload를 검증된 기존 runner CLI 인자로만 변환한다. */
export function createRunnerInvocation(job: ClaimedRemoteJob, repoRoot: string): RunnerInvocation | null {
  const payload = job.payload;
  const args: string[] = [];

  switch (job.action) {
    case "PHOTO_SORT": {
      const sourceFolder = stringValue(payload, "source_folder");
      const workFolder = stringValue(payload, "work_folder");
      if (Boolean(sourceFolder) === Boolean(workFolder)) {
        throw new Error("PHOTO_SORT에는 source_folder 또는 work_folder 중 하나가 필요합니다.");
      }
      addString(args, sourceFolder ? "--source-folder" : "--work-folder", sourceFolder ?? workFolder);
      addString(args, "--department", stringValue(payload, "department"));
      addString(args, "--shooting-mode", stringValue(payload, "shooting_mode"));
      addNumber(args, "--gap-minutes", numberValue(payload, "gap_minutes"));
      addString(args, "--classification-ui-mode", stringValue(payload, "classification_ui_mode"));
      addBoolean(args, "--fast-analyze-mode", booleanValue(payload, "fast_analyze_mode"));
      addBoolean(args, "--department-logic-enabled", booleanValue(payload, "department_logic_enabled"));
      addBoolean(args, "--ai-naming-enabled", booleanValue(payload, "ai_naming_enabled"));
      addBoolean(args, "--quality-analysis-enabled", booleanValue(payload, "quality_analysis_enabled"));
      addBoolean(args, "--profile-classification-enabled", booleanValue(payload, "profile_classification_enabled"));
      return runner(repoRoot, "remote-photo-sort-runner.ts", args);
    }
    case "PHOTO_PREPARE_SOURCE":
      addString(args, "--source-relative-path", stringValue(payload, "source_relative_path", true));
      return runner(repoRoot, "photo-prepare-source-runner.ts", args);
    case "PHOTO_STAGE_JPG":
      addString(args, "--source-relative-path", stringValue(payload, "source_relative_path", true));
      addString(args, "--destination-relative-path", stringValue(payload, "destination_relative_path"));
      return runner(repoRoot, "photo-stage-jpg-runner.ts", args);
    case "PHOTO_CLASSIFY_WORK":
      addString(args, "--work-relative-path", stringValue(payload, "work_relative_path", true));
      addString(args, "--department", stringValue(payload, "department"));
      addString(args, "--shooting-mode", stringValue(payload, "shooting_mode"));
      addNumber(args, "--gap-minutes", numberValue(payload, "gap_minutes"));
      addString(args, "--classification-ui-mode", stringValue(payload, "classification_ui_mode"));
      addBoolean(args, "--fast-analyze-mode", booleanValue(payload, "fast_analyze_mode"));
      addBoolean(args, "--department-logic-enabled", booleanValue(payload, "department_logic_enabled"));
      addBoolean(args, "--ai-naming-enabled", booleanValue(payload, "ai_naming_enabled"));
      addBoolean(args, "--quality-analysis-enabled", booleanValue(payload, "quality_analysis_enabled"));
      addBoolean(args, "--profile-classification-enabled", booleanValue(payload, "profile_classification_enabled"));
      addNumber(args, "--expected-jpg-count", numberValue(payload, "expected_jpg_count"));
      addNumber(args, "--expected-jpg-bytes", numberValue(payload, "expected_jpg_bytes"));
      return runner(repoRoot, "photo-classify-work-runner.ts", args);
    case "PHOTO_RAW_MATCH": {
      addString(args, "--project-relative-path", stringValue(payload, "project_relative_path", true));
      const selected = arrayValue(payload, "selected_file_names");
      if (selected) addString(args, "--selected-file-names-json", JSON.stringify(selected));
      return runner(repoRoot, "photo-raw-match-runner.ts", args);
    }
    case "PHOTO_RESIZE":
      addString(args, "--project-relative-path", stringValue(payload, "project_relative_path", true));
      addString(args, "--input-relative-path", stringValue(payload, "input_relative_path"));
      addNumber(args, "--long-edge", numberValue(payload, "long_edge"));
      addNumber(args, "--quality", numberValue(payload, "quality"));
      return runner(repoRoot, "photo-resize-runner.ts", args);
    case "PHOTO_AI_SELECT":
      addString(args, "--project-relative-path", stringValue(payload, "project_relative_path", true));
      addString(args, "--input-relative-path", stringValue(payload, "input_relative_path"));
      addBoolean(args, "--quality-filter", booleanValue(payload, "quality_filter"));
      addNumber(args, "--blur-threshold", numberValue(payload, "blur_threshold"));
      addNumber(args, "--dark-threshold", numberValue(payload, "dark_threshold"));
      addNumber(args, "--overexp-threshold", numberValue(payload, "overexp_threshold"));
      addBoolean(args, "--dup-removal", booleanValue(payload, "dup_removal"));
      addNumber(args, "--dup-threshold", numberValue(payload, "dup_threshold"));
      return runner(repoRoot, "photo-ai-select-runner.ts", args);
    case "PHOTO_RETOUCH": {
      addString(args, "--project-relative-path", stringValue(payload, "project_relative_path", true));
      const files = arrayValue(payload, "file_names");
      if (!files?.length) throw new Error("PHOTO_RETOUCH에는 file_names가 필요합니다.");
      addString(args, "--file-names-json", JSON.stringify(files));
      addString(args, "--check-type", stringValue(payload, "check_type"));
      return runner(repoRoot, "photo-retouch-runner.ts", args);
    }
    case "PING":
    case "COPY_TEST":
    case "LIST_FOLDER":
      return null;
    default:
      throw new Error(`지원하지 않는 Worker action입니다: ${job.action}`);
  }
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

async function executeRunner(
  invocation: RunnerInvocation,
  onProgress: (progress: JsonRecord) => Promise<void>,
): Promise<RunnerOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stderrBuffer = "";
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

    child.stdout.on("data", (chunk: Buffer) => {
      try {
        stdout = captureWithLimit(stdout, chunk);
      } catch (error) {
        child.kill("SIGTERM");
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
        child.kill("SIGTERM");
        reject(error);
      }
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (stderrBuffer) processStderrLine(stderrBuffer);
      void progressReporter.flush().then(() => {
        resolve({
          exitCode: code ?? 1,
          result: parseLastJsonObject(stdout),
          stdout,
          stderr,
        });
      });
    });
  });
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function listFolder(payload: JsonRecord): Promise<JsonRecord> {
  const configuredRoot = process.env.SOURCE_ROOT?.trim() || process.env.OLIVIA_PHOTO_SOURCE_ROOT?.trim();
  if (!configuredRoot) throw new Error("SOURCE_ROOT 또는 OLIVIA_PHOTO_SOURCE_ROOT가 설정되어 있지 않습니다.");
  const rootRequested = booleanValue(payload, "root") === true;
  const requestedPath = stringValue(payload, "remote_path") ?? "";
  const relativePath = normalizeRemoteNasRelativePath(requestedPath);
  if (rootRequested && relativePath) throw new Error("LIST_FOLDER의 root와 remote_path를 동시에 지정할 수 없습니다.");
  const foldersOnly = booleanValue(payload, "folders_only") === true;
  const root = await realpath(configuredRoot);
  const target = path.resolve(root, ...relativePath.split("/").filter(Boolean));
  if (!isInside(root, target)) throw new Error("LIST_FOLDER 경로가 SOURCE_ROOT 밖입니다.");
  const targetMetadata = await lstat(target);
  if (targetMetadata.isSymbolicLink() || !targetMetadata.isDirectory()) throw new Error("조회 대상이 안전한 폴더가 아닙니다.");
  const canonicalTarget = await realpath(target);
  if (!isInside(root, canonicalTarget)) throw new Error("LIST_FOLDER 경로가 SOURCE_ROOT 밖을 가리킵니다.");

  const entries: JsonRecord[] = [];
  for (const entry of await readdir(canonicalTarget, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (!entry.isDirectory() && !entry.isFile()) continue;
    if (foldersOnly && !entry.isDirectory()) continue;
    const entryRelativePath = relativePath ? path.posix.join(relativePath, entry.name) : entry.name;
    const metadata = await stat(path.join(canonicalTarget, entry.name));
    entries.push({
      name: entry.name,
      displayName: entry.name.normalize("NFC"),
      path: entryRelativePath,
      displayPath: toRemoteNasDisplayPath(entryRelativePath),
      type: entry.isDirectory() ? "folder" : "file",
      ...(entry.isFile() ? { size: metadata.size } : {}),
      modifiedAt: metadata.mtime.toISOString(),
    });
  }
  const result = {
    ok: true,
    root: REMOTE_NAS_ROOT_NAME,
    path: relativePath,
    displayPath: toRemoteNasDisplayPath(relativePath),
    entries,
  };
  console.info(`[remote-bridge] LIST_FOLDER completed: ${relativePath || "ROOT"}`);
  return result;
}

async function copyTest(): Promise<JsonRecord> {
  const workerHome = process.env.OLIVIA_WORKER_HOME?.trim() || path.join(homedir(), "OliviaWorker");
  const stateDirectory = process.env.OLIVIA_WORKER_STATE_DIR?.trim() || path.join(workerHome, "state");
  await mkdir(stateDirectory, { recursive: true });
  const marker = randomUUID();
  const source = path.join(stateDirectory, `.copy-test-${marker}.source`);
  const destination = path.join(stateDirectory, `.copy-test-${marker}.destination`);
  try {
    await writeFile(source, marker, "utf8");
    await copyFile(source, destination);
    const copied = await readFile(destination, "utf8");
    if (copied !== marker) throw new Error("COPY_TEST 검증 결과가 원본과 다릅니다.");
    return { ok: true, status: "COPY_TEST_COMPLETED", bytes: Buffer.byteLength(marker) };
  } finally {
    await unlink(source).catch(() => undefined);
    await unlink(destination).catch(() => undefined);
  }
}

async function executeBuiltIn(job: ClaimedRemoteJob): Promise<JsonRecord> {
  if (job.action === "PING") {
    return { ok: true, status: "PONG", workerId: configuredWorkerId(), at: new Date().toISOString() };
  }
  if (job.action === "COPY_TEST") return copyTest();
  if (job.action === "LIST_FOLDER") return listFolder(job.payload);
  throw new Error(`내장 실행기가 없는 action입니다: ${job.action}`);
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

export async function runClaimedJob(job: ClaimedRemoteJob, repoRoot: string): Promise<boolean> {
  await reportJob(job.job_id, { status: "RUNNING", message: `${job.action} 실행 중` });
  try {
    const invocation = createRunnerInvocation(job, repoRoot);
    if (!invocation) {
      const result = await executeBuiltIn(job);
      await reportJob(job.job_id, { status: "COMPLETED", result, message: `${job.action} 완료` });
      return true;
    }

    const outcome = await executeRunner(invocation, async (progress) => {
      await reportJob(job.job_id, { status: "RUNNING", progress });
    });
    const successful = outcome.exitCode === 0 && outcome.result?.ok !== false;
    if (!successful) {
      const error = resolveRunnerError(outcome);
      await reportJob(job.job_id, {
        status: "FAILED",
        error,
        message: error,
        ...(outcome.result ? { result: outcome.result } : {}),
      });
      console.error(`[remote-bridge] ${job.action} 실패: ${error}`);
      return false;
    }

    const result = outcome.result ?? { ok: true, stdout: outcome.stdout.trim() };
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
