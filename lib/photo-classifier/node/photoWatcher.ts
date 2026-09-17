import {
  access,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { JPG_PHOTO_EXTENSIONS, RAW_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import { getStorageRoots } from "./storageConfig";
import type { RunnerRoots } from "./types";

export type PhotoWatcherProjectStatus =
  | "SEEN_EXISTING"
  | "DETECTED"
  | "STABILIZING"
  | "PREPARING" // legacy state; read-only watcher never enters it
  | "READY"
  | "REVIEW_REQUIRED"
  | "CHANGED_EXISTING"
  | "ERROR";

export type PhotoProjectFingerprint = {
  fileCount: number;
  totalBytes: number;
  latestModifiedAt: number;
  rawCount: number;
  jpgCount: number;
  jpgBytes: number;
  jpgRootCount: number;
  jpgOriginalCount: number;
};

export type PhotoWatcherProjectState = {
  status: PhotoWatcherProjectStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  stableSince: string | null;
  fingerprint: PhotoProjectFingerprint | null;
  preparedAt: string | null;
  summary?: { rawCount: number; jpgCount: number; jpgMoved: number };
  errorMessage?: string | null;
  serverSyncStatus?: "PENDING" | "SYNCED";
  serverSyncError?: string | null;
  serverReportedAt?: string | null;
};

export type PhotoWatcherReadyReport = {
  projectName: string;
  sourceRelativePath: string;
  rawCount: number;
  jpgCount: number;
  jpgBytes: number;
  fingerprint: string;
  preparedAt: string | null;
  status: "READY" | "REVIEW_REQUIRED";
  message?: string | null;
  /** Olivia OS 2.0 PHASE 6 — NAS Backup Watcher(§8)가 fileCount/totalBytes를 그대로 쓸 수
   * 있도록 전체 fingerprint 총합을 추가로 실어 보낸다. 기존 reportReady 소비자(photo-storage
   * 리포터)는 이 필드를 참조하지 않으므로 기존 동작에는 영향이 없다. */
  fileCount: number;
  totalBytes: number;
  firstSeenAt: string;
};

export type PhotoWatcherState = {
  version: 1;
  baselineComplete: boolean;
  projects: Record<string, PhotoWatcherProjectState>;
  sourceStatus?: "ONLINE" | "SOURCE_OFFLINE";
  lastScanAt?: string;
};

export type PhotoWatcherScanResult = {
  sourceStatus: "ONLINE" | "SOURCE_OFFLINE";
  baselineInitialized: boolean;
  changedProjects: string[];
  readyProjects: string[];
  reviewProjects: string[];
  errors: string[];
};

export type PhotoStorageWatcherOptions = {
  roots?: RunnerRoots;
  statePath?: string;
  lockPath?: string;
  intervalSeconds?: number;
  stableSeconds?: number;
  now?: () => Date;
  logger?: (message: string) => void;
  reportReady?: (report: PhotoWatcherReadyReport) => Promise<void>;
};

// #recycle/@Recycle/@eaDir는 Synology 등 NAS가 자동 생성하는 휴지통/썸네일 캐시 폴더다 —
// 실제 촬영 프로젝트가 아니므로 baseline/신규 감지 어느 쪽에서도 절대 project로 취급하지
// 않는다(Olivia OS 2.0 PHASE 6 §5-1).
const SYSTEM_PROJECT_NAMES = new Set([
  ".DS_Store", ".Trashes", ".Spotlight-V100", ".fseventsd",
  "#recycle", "@Recycle", "@eaDir",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extension(name: string): string {
  return name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
}

function sameFingerprint(left: PhotoProjectFingerprint | null, right: PhotoProjectFingerprint): boolean {
  if (!left) return false;
  return left.fileCount === right.fileCount
    && left.totalBytes === right.totalBytes
    && left.latestModifiedAt === right.latestModifiedAt
    && left.rawCount === right.rawCount
    && left.jpgCount === right.jpgCount
    && left.jpgBytes === right.jpgBytes
    && left.jpgRootCount === right.jpgRootCount
    && left.jpgOriginalCount === right.jpgOriginalCount;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function isPathPresent(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function atomicWriteJson(target: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
}

async function readState(target: string): Promise<PhotoWatcherState | null> {
  if (!await isPathPresent(target)) return null;
  const parsed: unknown = JSON.parse(await readFile(target, "utf8"));
  if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.baselineComplete !== "boolean" || !isRecord(parsed.projects)) {
    throw new Error("Photo Watcher 상태 파일 형식이 올바르지 않습니다.");
  }
  return parsed as unknown as PhotoWatcherState;
}

function defaultStatePath(): string {
  const configured = process.env.OLIVIA_PHOTO_WATCH_STATE_PATH?.trim();
  if (configured) {
    if (!path.isAbsolute(configured) || configured.includes("\0")) throw new Error("OLIVIA_PHOTO_WATCH_STATE_PATH는 안전한 절대경로여야 합니다.");
    return path.normalize(configured);
  }
  return path.join(process.cwd(), ".olivia", "photo-watcher-state.json");
}

function redactedError(message: string, roots: RunnerRoots): string {
  return message.replaceAll(roots.sourceRoot, "[SOURCE_ROOT]").replaceAll(roots.workRoot, "[WORK_ROOT]");
}

/** 재귀 fingerprint. 심볼릭 링크는 추적하지 않고 안전 오류로 처리한다. */
export async function fingerprintPhotoProject(projectRoot: string): Promise<PhotoProjectFingerprint> {
  const rootMetadata = await lstat(projectRoot);
  if (rootMetadata.isSymbolicLink()) throw new Error("프로젝트 폴더가 심볼릭 링크입니다.");
  if (!rootMetadata.isDirectory()) throw new Error("프로젝트가 폴더가 아닙니다.");
  const fingerprint: PhotoProjectFingerprint = {
    fileCount: 0,
    totalBytes: 0,
    latestModifiedAt: 0,
    rawCount: 0,
    jpgCount: 0,
    jpgBytes: 0,
    jpgRootCount: 0,
    jpgOriginalCount: 0,
  };

  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.join(relativeDirectory, entry.name).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`심볼릭 링크가 포함되어 있습니다: ${relativePath}`);
      if (entry.isDirectory()) {
        await visit(fullPath, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const metadata = await stat(fullPath);
      const fileExtension = extension(entry.name);
      fingerprint.fileCount += 1;
      fingerprint.totalBytes += metadata.size;
      fingerprint.latestModifiedAt = Math.max(fingerprint.latestModifiedAt, metadata.mtimeMs);
      if (RAW_PHOTO_EXTENSIONS.has(fileExtension)) fingerprint.rawCount += 1;
      if (JPG_PHOTO_EXTENSIONS.has(fileExtension)) {
        fingerprint.jpgCount += 1;
        fingerprint.jpgBytes += metadata.size;
        if (relativeDirectory === "") fingerprint.jpgRootCount += 1;
      }
      if (JPG_PHOTO_EXTENSIONS.has(fileExtension) && (relativeDirectory === "JPG원본" || relativeDirectory.startsWith("JPG원본/") || relativeDirectory === "JPG전체" || relativeDirectory.startsWith("JPG전체/"))) fingerprint.jpgOriginalCount += 1;
    }
  };

  await visit(projectRoot, "");
  return fingerprint;
}

const SYSTEM_PROJECT_NAMES_LOWER = new Set([...SYSTEM_PROJECT_NAMES].map((name) => name.toLocaleLowerCase("en-US")));

async function listProjects(sourceRoot: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SYSTEM_PROJECT_NAMES_LOWER.has(entry.name.toLocaleLowerCase("en-US"))) continue;
    if (entry.isSymbolicLink()) {
      result.push(entry.name);
      continue;
    }
    if (!entry.isDirectory()) continue;
    result.push(entry.name);
  }
  return result;
}

export class PhotoStorageWatcher {
  private readonly roots: RunnerRoots;
  private readonly statePath: string;
  private readonly lockPath: string;
  private readonly intervalMs: number;
  private readonly stableMs: number;
  private readonly now: () => Date;
  private readonly logger: (message: string) => void;
  private readonly reportReady?: (report: PhotoWatcherReadyReport) => Promise<void>;
  private state: PhotoWatcherState | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lockHandle: Awaited<ReturnType<typeof open>> | null = null;
  private scanPromise: Promise<PhotoWatcherScanResult> | null = null;

  constructor(options: PhotoStorageWatcherOptions = {}) {
    this.roots = options.roots ?? getStorageRoots();
    this.statePath = options.statePath ?? defaultStatePath();
    this.lockPath = options.lockPath ?? `${this.statePath}.lock`;
    const intervalSeconds = options.intervalSeconds ?? Number(process.env.OLIVIA_PHOTO_WATCH_INTERVAL_SECONDS ?? "30");
    const stableSeconds = options.stableSeconds ?? Number(process.env.OLIVIA_PHOTO_STABLE_SECONDS ?? "180");
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) throw new Error("OLIVIA_PHOTO_WATCH_INTERVAL_SECONDS는 0보다 큰 숫자여야 합니다.");
    if (!Number.isFinite(stableSeconds) || stableSeconds <= 0) throw new Error("OLIVIA_PHOTO_STABLE_SECONDS는 0보다 큰 숫자여야 합니다.");
    this.intervalMs = intervalSeconds * 1000;
    this.stableMs = stableSeconds * 1000;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? ((message) => console.log(message));
    this.reportReady = options.reportReady;
  }

  private log(message: string): void {
    this.logger(`[PHOTO_WATCHER] ${message}`);
  }

  private async acquireLock(): Promise<void> {
    await mkdir(path.dirname(this.lockPath), { recursive: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        this.lockHandle = await open(this.lockPath, "wx");
        await this.lockHandle.writeFile(`${process.pid}\n`, "utf8");
        await this.lockHandle.sync();
        return;
      } catch (error) {
        if (errorCode(error) !== "EEXIST") throw error;
        const owner = Number.parseInt(await readFile(this.lockPath, "utf8").catch(() => "0"), 10);
        if (Number.isFinite(owner) && owner > 0) {
          try {
            process.kill(owner, 0);
            throw new Error("Photo Watcher가 이미 실행 중입니다.");
          } catch (probeError) {
            if (probeError instanceof Error && probeError.message.includes("이미 실행 중")) throw probeError;
            // 권한 부족(EPERM)은 프로세스가 살아 있다는 뜻이므로 stale lock으로
            // 간주해 삭제하면 안 된다.
            if (errorCode(probeError) === "EPERM") throw new Error("Photo Watcher가 이미 실행 중입니다.");
          }
        }
        await unlink(this.lockPath).catch(() => undefined);
      }
    }
    throw new Error("Photo Watcher lock을 확보하지 못했습니다.");
  }

  private async releaseLock(): Promise<void> {
    await this.lockHandle?.close().catch(() => undefined);
    this.lockHandle = null;
    await unlink(this.lockPath).catch(() => undefined);
  }

  private async persist(): Promise<void> {
    if (this.state) await atomicWriteJson(this.statePath, this.state);
  }

  private async ensureState(): Promise<{ state: PhotoWatcherState; existed: boolean }> {
    if (this.state) return { state: this.state, existed: true };
    const loaded = await readState(this.statePath);
    this.state = loaded ?? { version: 1, baselineComplete: false, projects: {} };
    return { state: this.state, existed: Boolean(loaded) };
  }

  private async sourceRoot(): Promise<string | null> {
    try {
      const metadata = await lstat(this.roots.sourceRoot);
      if (metadata.isSymbolicLink()) return null;
      const canonical = await realpath(this.roots.sourceRoot);
      const canonicalMetadata = await stat(canonical);
      return canonicalMetadata.isDirectory() ? canonical : null;
    } catch {
      return null;
    }
  }

  private async markStableProject(sourceRoot: string, projectName: string, current: PhotoProjectFingerprint): Promise<"READY" | "STABILIZING" | "ERROR"> {
    const projectRoot = path.join(sourceRoot, projectName);
    // Final read-only revalidation closes the race between the stable scan and
    // the READY report. No source preparation or filesystem mutation occurs.
    let revalidated: PhotoProjectFingerprint;
    try {
      revalidated = await fingerprintPhotoProject(projectRoot);
    } catch (error) {
      // A folder disappearing between scans is intentionally not treated as
      // deletion. Keep the prior project state and let the next scan decide.
      if (errorCode(error) === "ENOENT") return "STABILIZING";
      const entry = this.state!.projects[projectName];
      entry.status = "ERROR";
      entry.errorMessage = redactedError(safeError(error), this.roots);
      this.log(`ERROR ${projectName}: ${entry.errorMessage}`);
      return "ERROR";
    }
    if (!sameFingerprint(current, revalidated)) {
      const entry = this.state!.projects[projectName];
      entry.status = "STABILIZING";
      entry.fingerprint = revalidated;
      entry.stableSince = this.now().toISOString();
      entry.lastSeenAt = this.now().toISOString();
      this.log(`파일 변화 감지, 안정화 재시작: ${projectName}`);
      return "STABILIZING";
    }

    const entry = this.state!.projects[projectName];
    entry.status = "READY";
    entry.fingerprint = revalidated;
    entry.preparedAt = null;
    entry.stableSince = null;
    entry.errorMessage = null;
    entry.summary = { rawCount: revalidated.rawCount, jpgCount: revalidated.jpgCount, jpgMoved: 0 };
    entry.serverSyncStatus = this.reportReady ? "PENDING" : undefined;
    entry.serverSyncError = null;
    entry.lastSeenAt = this.now().toISOString();
    this.log(`backup stable: ${projectName}`);
    this.log(`READY raw=${revalidated.rawCount} jpg=${revalidated.jpgCount}: ${projectName}`);
    await this.syncReadyProject(projectName, entry);
    return "READY";
  }

  private async syncReadyProject(projectName: string, entry: PhotoWatcherProjectState): Promise<void> {
    if (!this.reportReady || (entry.status !== "READY" && entry.status !== "REVIEW_REQUIRED") || entry.serverSyncStatus === "SYNCED" || !entry.fingerprint) return;
    try {
      await this.reportReady({
        projectName,
        sourceRelativePath: projectName,
        rawCount: entry.summary?.rawCount ?? entry.fingerprint.rawCount,
        jpgCount: entry.summary?.jpgCount ?? entry.fingerprint.jpgCount,
        jpgBytes: entry.fingerprint.jpgBytes,
        fingerprint: JSON.stringify(entry.fingerprint),
        preparedAt: entry.preparedAt,
        status: entry.status,
        message: entry.errorMessage,
        fileCount: entry.fingerprint.fileCount,
        totalBytes: entry.fingerprint.totalBytes,
        firstSeenAt: entry.firstSeenAt,
      });
      entry.serverSyncStatus = "SYNCED";
      entry.serverSyncError = null;
      entry.serverReportedAt = this.now().toISOString();
      this.log(`server report synced: ${projectName}`);
    } catch (error) {
      entry.serverSyncStatus = "PENDING";
      entry.serverSyncError = redactedError(safeError(error), this.roots);
      this.log(`server report pending: ${projectName}`);
    }
  }

  private async performScan(): Promise<PhotoWatcherScanResult> {
    const { state, existed } = await this.ensureState();
    const sourceRoot = await this.sourceRoot();
    if (!sourceRoot) {
      state.sourceStatus = "SOURCE_OFFLINE";
      state.lastScanAt = this.now().toISOString();
      await this.persist();
      this.log("SOURCE_OFFLINE");
      return { sourceStatus: "SOURCE_OFFLINE", baselineInitialized: false, changedProjects: [], readyProjects: [], reviewProjects: [], errors: [] };
    }
    this.log("source online");
    state.sourceStatus = "ONLINE";
    state.lastScanAt = this.now().toISOString();
    let projectNames: string[];
    try {
      projectNames = await listProjects(sourceRoot);
    } catch {
      // 마운트는 보이지만 SMB 디렉터리 열람이 잠시 실패한 경우도
      // 프로젝트 상태를 훼손하지 않고 offline으로 취급한다.
      this.log("SOURCE_OFFLINE");
      return { sourceStatus: "SOURCE_OFFLINE", baselineInitialized: false, changedProjects: [], readyProjects: [], reviewProjects: [], errors: [] };
    }
    const now = this.now();
    const result: PhotoWatcherScanResult = { sourceStatus: "ONLINE", baselineInitialized: false, changedProjects: [], readyProjects: [], reviewProjects: [], errors: [] };

    if (!existed || !state.baselineComplete) {
      for (const projectName of projectNames) {
        try {
          const fingerprint = await fingerprintPhotoProject(path.join(sourceRoot, projectName));
          state.projects[projectName] = {
            status: "SEEN_EXISTING",
            firstSeenAt: now.toISOString(),
            lastSeenAt: now.toISOString(),
            stableSince: null,
            fingerprint,
            preparedAt: null,
            errorMessage: null,
          };
        } catch (error) {
          state.projects[projectName] = {
            status: "ERROR",
            firstSeenAt: now.toISOString(),
            lastSeenAt: now.toISOString(),
            stableSince: null,
            fingerprint: null,
            preparedAt: null,
            errorMessage: redactedError(safeError(error), this.roots),
          };
          result.errors.push(projectName);
        }
      }
      state.baselineComplete = true;
      result.baselineInitialized = true;
      await this.persist();
      this.log(`baseline complete: ${projectNames.length}개 프로젝트`);
      return result;
    }

    for (const projectName of projectNames) {
      const projectRoot = path.join(sourceRoot, projectName);
      let fingerprint: PhotoProjectFingerprint;
      try {
        fingerprint = await fingerprintPhotoProject(projectRoot);
      } catch (error) {
        // 목록을 읽은 직후 폴더가 사라진 경우는 삭제로 판단하지 않는다.
        // 삭제 감지는 후속 단계에서 별도 정책으로 다룬다.
        if (errorCode(error) === "ENOENT") continue;
        const previous = state.projects[projectName];
        state.projects[projectName] = {
          status: "ERROR",
          firstSeenAt: previous?.firstSeenAt ?? now.toISOString(),
          lastSeenAt: now.toISOString(),
          stableSince: null,
          fingerprint: previous?.fingerprint ?? null,
          preparedAt: previous?.preparedAt ?? null,
          errorMessage: redactedError(safeError(error), this.roots),
        };
        result.errors.push(projectName);
        this.log(`ERROR ${projectName}: ${state.projects[projectName].errorMessage}`);
        continue;
      }

      const previous = state.projects[projectName];
      if (!previous) {
        state.projects[projectName] = {
          status: "DETECTED",
          firstSeenAt: now.toISOString(),
          lastSeenAt: now.toISOString(),
          stableSince: null,
          fingerprint,
          preparedAt: null,
          errorMessage: null,
        };
        this.log(`new project detected: ${projectName}`);
        continue;
      }

      const changed = !sameFingerprint(previous.fingerprint, fingerprint);
      previous.lastSeenAt = now.toISOString();
      if (previous.status === "SEEN_EXISTING") {
        if (changed) {
          previous.status = "CHANGED_EXISTING";
          previous.fingerprint = fingerprint;
          result.changedProjects.push(projectName);
          this.log(`changed existing project: ${projectName}`);
        }
        continue;
      }
      if (previous.status === "REVIEW_REQUIRED") {
        if (changed) previous.fingerprint = fingerprint;
        else await this.syncReadyProject(projectName, previous);
        continue;
      }
      if (previous.status === "CHANGED_EXISTING" || previous.status === "ERROR") {
        if (changed) previous.fingerprint = fingerprint;
        continue;
      }
      if (previous.status === "READY") {
        if (changed) {
          previous.fingerprint = fingerprint;
        } else {
          await this.syncReadyProject(projectName, previous);
        }
        continue;
      }
      if (previous.status === "PREPARING") {
        // 중단 후 재시작 시 자동 중복 실행하지 않고 다시 안정화부터 확인한다.
        previous.status = "STABILIZING";
        previous.stableSince = now.toISOString();
        previous.fingerprint = fingerprint;
        continue;
      }
      if (changed) {
        previous.status = "STABILIZING";
        previous.fingerprint = fingerprint;
        previous.stableSince = now.toISOString();
        continue;
      }
      if (previous.status === "DETECTED") {
        previous.status = "STABILIZING";
        previous.stableSince = now.toISOString();
        continue;
      }
      if (previous.status === "STABILIZING" && previous.stableSince) {
        const stableDuration = now.getTime() - new Date(previous.stableSince).getTime();
        this.log(`stabilizing ${Math.max(0, Math.floor(stableDuration / 1000))}/${Math.floor(this.stableMs / 1000)} sec: ${projectName}`);
        if (stableDuration >= this.stableMs) {
          const finalStatus = await this.markStableProject(sourceRoot, projectName, fingerprint);
          if (finalStatus === "READY") result.readyProjects.push(projectName);
          if (finalStatus === "ERROR") result.errors.push(projectName);
        }
      }
    }

    await this.persist();
    return result;
  }

  async scanOnce(): Promise<PhotoWatcherScanResult> {
    if (this.scanPromise) return this.scanPromise;
    this.scanPromise = this.performScan().finally(() => { this.scanPromise = null; });
    return this.scanPromise;
  }

  async start(options: { once?: boolean } = {}): Promise<PhotoWatcherScanResult> {
    await this.acquireLock();
    try {
      const first = await this.scanOnce();
      if (options.once) {
        await this.stop();
        return first;
      }
      this.timer = setInterval(() => { void this.scanOnce().catch((error) => this.log(`ERROR scan: ${safeError(error)}`)); }, this.intervalMs);
      return first;
    } catch (error) {
      await this.releaseLock();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.scanPromise) await this.scanPromise.catch(() => undefined);
    await this.persist();
    await this.releaseLock();
  }
}
