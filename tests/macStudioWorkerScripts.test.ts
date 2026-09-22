import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCoalescedProgressReporter,
  createRunnerInvocation,
  parseClaimedJob,
  resolveRunnerError,
  runClaimedJob,
  type ClaimedRemoteJob,
} from "@/scripts/mac-studio-remote-bridge";

const repoRoot = process.cwd();
const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function job(action: string, payload: Record<string, unknown>): ClaimedRemoteJob {
  return { job_id: "018e2f30-92af-78b1-8f21-67f4404f5027", action, payload };
}

describe("Mac Studio Worker repository scripts", () => {
  it("coalesces superseded progress while preserving the latest snapshot", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const sent: Record<string, unknown>[] = [];
    const reporter = createCoalescedProgressReporter(async (progress) => {
      sent.push(progress);
      if (sent.length === 1) await firstRequest;
    }, { intervalMs: 500 });

    reporter.push({ stage: "PREPARING", current: 0, total: 473, message: "시작" });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    reporter.push({ stage: "PREPARING", current: 1, total: 473, message: "첫 파일" });
    reporter.push({ stage: "PREPARING", current: 472, total: 473, message: "마지막 전 파일" });
    reporter.push({ stage: "PREPARING", current: 473, total: 473, message: "마지막 파일" });
    releaseFirst?.();
    await reporter.flush();

    expect(sent).toEqual([
      { stage: "PREPARING", current: 0, total: 473, message: "시작" },
      { stage: "PREPARING", current: 473, total: 473, message: "마지막 파일" },
    ]);
  });

  it("waits for the last coalesced progress report before terminal reporting continues", async () => {
    let releaseFirst: (() => void) | undefined;
    let releaseLast: (() => void) | undefined;
    const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const lastRequest = new Promise<void>((resolve) => { releaseLast = resolve; });
    const sent: number[] = [];
    const reporter = createCoalescedProgressReporter(async (progress) => {
      sent.push(Number(progress.current));
      if (sent.length === 1) await firstRequest;
      if (sent.length === 2) await lastRequest;
    }, { intervalMs: 0 });

    reporter.push({ stage: "PREPARING", current: 0, total: 2, message: "시작" });
    await vi.waitFor(() => expect(sent).toEqual([0]));
    reporter.push({ stage: "PREPARING", current: 2, total: 2, message: "완료" });
    const flush = reporter.flush();
    releaseFirst?.();
    await vi.waitFor(() => expect(sent).toEqual([0, 2]));
    let flushed = false;
    void flush.then(() => { flushed = true; });
    await Promise.resolve();
    expect(flushed).toBe(false);
    releaseLast?.();
    await flush;
    expect(flushed).toBe(true);
  });

  it("maps all PHASE 6 actions to their existing runners", () => {
    const prepare = createRunnerInvocation(job("PHOTO_PREPARE_SOURCE", {
      source_relative_path: "0918_삼칠갈비",
    }), repoRoot);
    const stage = createRunnerInvocation(job("PHOTO_STAGE_JPG", {
      source_relative_path: "0918_삼칠갈비",
      destination_relative_path: "0918_삼칠갈비",
    }), repoRoot);
    const classify = createRunnerInvocation(job("PHOTO_CLASSIFY_WORK", {
      work_relative_path: "0918_삼칠갈비",
      department: "dermatology",
      shooting_mode: "field",
      expected_jpg_count: 2584,
      expected_jpg_bytes: 123456,
    }), repoRoot);

    expect(prepare?.args).toContain(path.join(repoRoot, "scripts/photo-prepare-source-runner.ts"));
    expect(prepare?.args).toContain("0918_삼칠갈비");
    expect(stage?.args).toContain(path.join(repoRoot, "scripts/photo-stage-jpg-runner.ts"));
    expect(stage?.args).toContain("--destination-relative-path");
    expect(classify?.args).toContain(path.join(repoRoot, "scripts/photo-classify-work-runner.ts"));
    expect(classify?.args).toEqual(expect.arrayContaining([
      "--expected-jpg-count", "2584", "--expected-jpg-bytes", "123456",
    ]));
  });

  it("keeps the PHASE 6 action contract visible in both installed shell entrypoints", async () => {
    for (const script of ["worker.sh", "remote-bridge.sh"]) {
      const source = await readFile(path.join(repoRoot, "ops/mac-studio/bin", script), "utf8");
      expect(source).toContain("PHOTO_PREPARE_SOURCE");
      expect(source).toContain("PHOTO_STAGE_JPG");
      expect(source).toContain("PHOTO_CLASSIFY_WORK");
    }
  });

  it("preserves a runner JSON error instead of replacing it with a generic message", () => {
    expect(resolveRunnerError({
      exitCode: 2,
      result: { ok: false, status: "REVIEW_REQUIRED", error: "동일 파일명 JPG 3건이 있습니다." },
      stdout: "",
      stderr: "other detail",
    })).toBe("동일 파일명 JPG 3건이 있습니다.");

    expect(resolveRunnerError({
      exitCode: 9,
      result: null,
      stdout: "",
      stderr: "permission denied: /Volumes/Workstation\n",
    })).toBe("permission denied: /Volumes/Workstation");
  });

  it("distinguishes an empty poll response from a malformed claimed job", () => {
    expect(parseClaimedJob({})).toBeNull();
    expect(() => parseClaimedJob({ action: "PHOTO_STAGE_JPG", payload: {} })).toThrow("job_id가 없습니다");
  });

  it.each([
    ["omitted", {}],
    ["empty", { remote_path: "" }],
    ["null", { remote_path: null }],
  ])("treats a %s LIST_FOLDER path as SOURCE_ROOT and preserves NFD entry paths", async (_label, payload) => {
    const root = await mkdtemp(path.join(tmpdir(), "olivia-worker-list-root-"));
    temporaryDirectories.push(root);
    const rawFolderName = "0815_강지혜".normalize("NFD");
    await mkdir(path.join(root, rawFolderName));

    const reports: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      reports.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const previousEnvironment = {
      REMOTE_API_BASE: process.env.REMOTE_API_BASE,
      OLIVIA_WORKER_TOKEN: process.env.OLIVIA_WORKER_TOKEN,
      SOURCE_ROOT: process.env.SOURCE_ROOT,
      OLIVIA_PHOTO_SOURCE_ROOT: process.env.OLIVIA_PHOTO_SOURCE_ROOT,
    };
    try {
      process.env.REMOTE_API_BASE = "https://olivia.example.test";
      process.env.OLIVIA_WORKER_TOKEN = "existing-worker-token";
      process.env.SOURCE_ROOT = root;
      delete process.env.OLIVIA_PHOTO_SOURCE_ROOT;

      await expect(runClaimedJob(job("LIST_FOLDER", payload), repoRoot)).resolves.toBe(true);

      const completed = reports.at(-1);
      expect(completed?.status).toBe("COMPLETED");
      expect(completed?.result).toMatchObject({
        ok: true,
        path: "",
        displayPath: "",
        entries: [{
          name: rawFolderName,
          displayName: "0815_강지혜",
          path: rawFolderName,
          displayPath: "0815_강지혜",
          type: "folder",
        }],
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("keeps rejecting unsafe LIST_FOLDER paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "olivia-worker-list-unsafe-"));
    temporaryDirectories.push(root);
    const reports: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      reports.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const previousEnvironment = {
      REMOTE_API_BASE: process.env.REMOTE_API_BASE,
      OLIVIA_WORKER_TOKEN: process.env.OLIVIA_WORKER_TOKEN,
      SOURCE_ROOT: process.env.SOURCE_ROOT,
    };
    try {
      process.env.REMOTE_API_BASE = "https://olivia.example.test";
      process.env.OLIVIA_WORKER_TOKEN = "existing-worker-token";
      process.env.SOURCE_ROOT = root;

      await expect(runClaimedJob(job("LIST_FOLDER", { remote_path: "../outside" }), repoRoot)).resolves.toBe(false);
      expect(reports.at(-1)).toMatchObject({ status: "FAILED" });
      expect(String(reports.at(-1)?.error)).toContain("NAS Root 밖");
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("passes zsh syntax checks", () => {
    for (const script of [
      "ops/mac-studio/bin/worker.sh",
      "ops/mac-studio/bin/remote-bridge.sh",
      "ops/mac-studio/install-worker-bin.sh",
      "ops/mac-studio/git-hooks/post-merge",
    ]) {
      expect(() => execFileSync("/bin/zsh", ["-n", path.join(repoRoot, script)])).not.toThrow();
    }
  });

  it("backs up an existing bin directory and installs repository scripts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "olivia-worker-install-"));
    temporaryDirectories.push(root);
    const workerHome = path.join(root, "OliviaWorker");
    const oldBin = path.join(workerHome, "bin");
    await mkdir(path.join(workerHome, "config"), { recursive: true });
    await mkdir(oldBin, { recursive: true });
    await writeFile(path.join(oldBin, "worker.sh"), "old worker\n", "utf8");
    await writeFile(path.join(oldBin, "remote-bridge.sh"), "old bridge\n", "utf8");
    await writeFile(path.join(workerHome, "config", "worker.env"), "KEEP_ME=1\n", "utf8");

    execFileSync("/bin/zsh", [path.join(repoRoot, "ops/mac-studio/install-worker-bin.sh")], {
      cwd: repoRoot,
      env: { ...process.env, OLIVIA_WORKER_HOME: workerHome, OLIVIA_SKIP_GIT_HOOK: "1" },
    });

    expect(await readFile(path.join(workerHome, "bin", "worker.sh"), "utf8"))
      .toBe(await readFile(path.join(repoRoot, "ops/mac-studio/bin/worker.sh"), "utf8"));
    expect(await readFile(path.join(workerHome, "config", "worker.env"), "utf8")).toBe("KEEP_ME=1\n");
    const backups = await readdir(path.join(workerHome, "backups"));
    expect(backups).toHaveLength(1);
    expect(await readFile(path.join(workerHome, "backups", backups[0], "bin", "worker.sh"), "utf8"))
      .toBe("old worker\n");
  });

  it("polls an empty queue once with the existing worker authentication headers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "olivia-worker-poll-"));
    temporaryDirectories.push(root);
    const fakeBin = path.join(root, "bin");
    const argumentsFile = path.join(root, "curl-arguments.txt");
    await mkdir(fakeBin);
    const fakeCurl = path.join(fakeBin, "curl");
    await writeFile(fakeCurl, `#!/bin/zsh
output=""
print -r -- "$@" > "$FAKE_CURL_ARGUMENTS_FILE"
while (( $# > 0 )); do
  if [[ "$1" == "-o" ]]; then output="$2"; shift 2; else shift; fi
done
print -r -- '{}' > "$output"
print -n -- '200'
`, "utf8");
    await chmod(fakeCurl, 0o755);

    await execFileAsync("/bin/zsh", [path.join(repoRoot, "ops/mac-studio/bin/worker.sh")], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: fakeBin,
        FAKE_CURL_ARGUMENTS_FILE: argumentsFile,
        REMOTE_API_BASE: "https://olivia.example.test",
        OLIVIA_WORKER_TOKEN: "existing-worker-token",
        OLIVIA_WORKER_ID: "jake-macstudio-01",
        OLIVIA_WORKER_ONCE: "1",
        OLIVIA_REPO_ROOT: repoRoot,
      },
    });
    const curlArguments = await readFile(argumentsFile, "utf8");
    expect(curlArguments).toContain("Authorization: Bearer existing-worker-token");
    expect(curlArguments).toContain("x-olivia-worker: jake-macstudio-01");
    expect(curlArguments).toContain("https://olivia.example.test/api/worker/next");
  });

  it("reports the actual PHASE 6 runner error instead of a generic failure", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "olivia-worker-bridge-"));
    temporaryDirectories.push(root);
    const jobFile = path.join(root, "job.json");
    const sourceRoot = path.join(root, "ssd1");
    const workRoot = path.join(root, "ssd2");
    await mkdir(sourceRoot);
    await mkdir(workRoot);
    await writeFile(jobFile, JSON.stringify(job("PHOTO_PREPARE_SOURCE", {
      source_relative_path: "0918_없는폴더",
    })), "utf8");

    const reports: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      reports.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const previousEnvironment = {
      REMOTE_API_BASE: process.env.REMOTE_API_BASE,
      OLIVIA_WORKER_TOKEN: process.env.OLIVIA_WORKER_TOKEN,
      OLIVIA_WORKER_ID: process.env.OLIVIA_WORKER_ID,
      OLIVIA_PHOTO_SOURCE_ROOT: process.env.OLIVIA_PHOTO_SOURCE_ROOT,
      OLIVIA_PHOTO_WORK_ROOT: process.env.OLIVIA_PHOTO_WORK_ROOT,
    };
    try {
      process.env.REMOTE_API_BASE = "https://olivia.example.test";
      process.env.OLIVIA_WORKER_TOKEN = "existing-worker-token";
      process.env.OLIVIA_WORKER_ID = "jake-macstudio-01";
      process.env.OLIVIA_PHOTO_SOURCE_ROOT = sourceRoot;
      process.env.OLIVIA_PHOTO_WORK_ROOT = workRoot;
      await expect(runClaimedJob(parseClaimedJob(JSON.parse(await readFile(jobFile, "utf8"))) as ClaimedRemoteJob, repoRoot))
        .resolves.toBe(false);

      expect(reports[0]?.status).toBe("RUNNING");
      expect(reports.at(-1)?.status).toBe("FAILED");
      const failed = reports.at(-1);
      expect(failed?.error).toEqual(expect.any(String));
      expect(String(failed?.error)).toContain("0918_없는폴더");
      expect(failed?.error).not.toBe("작업 실패");
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
