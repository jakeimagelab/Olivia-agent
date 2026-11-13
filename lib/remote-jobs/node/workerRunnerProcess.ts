import { spawn, type ChildProcess } from "node:child_process";
import type { RunnerInvocation } from "./workerRunnerInvocation";
import { createCoalescedProgressReporter } from "../workerProgressReporter";
import type { WorkerJsonRecord } from "../workerPayload";

const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;

export type RunnerOutcome = {
  exitCode: number;
  result: WorkerJsonRecord | null;
  stdout: string;
  stderr: string;
  cancellationRequested?: boolean;
};

function isRecord(value: unknown): value is WorkerJsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseLastJsonObject(stdout: string): WorkerJsonRecord | null {
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
  if (stdoutLine && !outcome.result) {
    return `runner 결과 JSON을 읽지 못했습니다: ${stdoutLine.slice(0, 500)}`;
  }
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
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      killIgnoringMissing(-child.pid, "SIGKILL");
    }
  }, 10_000);
}

export async function executeRunner(
  invocation: RunnerInvocation,
  onProgress: (progress: WorkerJsonRecord) => Promise<void>,
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
        // 취소 조회 실패는 작업 실패가 아니다. 다음 polling에서 다시 확인한다.
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
