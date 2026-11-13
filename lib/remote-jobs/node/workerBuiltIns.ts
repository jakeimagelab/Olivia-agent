import { randomUUID } from "node:crypto";
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
import { homedir } from "node:os";
import path from "node:path";
import {
  normalizeRemoteNasRelativePath,
  toRemoteNasDisplayPath,
} from "@/lib/remote-nas/path";
import { REMOTE_NAS_ROOT_NAME } from "@/lib/remote-nas/types";
import { getStorageRoots } from "@/lib/photo-classifier/node/storageConfig";
import {
  getPersonSelectRoots,
  resolvePersonSelectSourcePath,
  toPersonSelectVirtualPath,
} from "@/lib/person-select/sourceRoots";
import { executeRemoteRawMatchCopy } from "@/lib/selectMatch/node/rawMatchCopy";
import type { RemoteRawMatchCopyPayload } from "@/lib/selectMatch/remoteRawMatch";
import {
  workerBooleanValue,
  workerStringValue,
  type WorkerJsonRecord,
} from "../workerPayload";

type BuiltInJob = {
  action: string;
  payload: WorkerJsonRecord;
};

type BuiltInOptions = {
  workerId: string;
  onProgress?: (progress: WorkerJsonRecord) => Promise<void>;
  shouldCancel?: () => Promise<boolean>;
};

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function listFolder(payload: WorkerJsonRecord): Promise<WorkerJsonRecord> {
  const configuredRoot = process.env.SOURCE_ROOT?.trim() || process.env.OLIVIA_PHOTO_SOURCE_ROOT?.trim();
  if (!configuredRoot) throw new Error("SOURCE_ROOT 또는 OLIVIA_PHOTO_SOURCE_ROOT가 설정되어 있지 않습니다.");
  const rootRequested = workerBooleanValue(payload, "root") === true;
  const requestedPath = workerStringValue(payload, "remote_path") ?? "";
  const relativePath = normalizeRemoteNasRelativePath(requestedPath);
  if (rootRequested && relativePath) {
    throw new Error("LIST_FOLDER의 root와 remote_path를 동시에 지정할 수 없습니다.");
  }
  const foldersOnly = workerBooleanValue(payload, "folders_only") === true;
  const root = await realpath(configuredRoot);
  const target = path.resolve(root, ...relativePath.split("/").filter(Boolean));
  if (!isInside(root, target)) throw new Error("LIST_FOLDER 경로가 SOURCE_ROOT 밖입니다.");
  const targetMetadata = await lstat(target);
  if (targetMetadata.isSymbolicLink() || !targetMetadata.isDirectory()) {
    throw new Error("조회 대상이 안전한 폴더가 아닙니다.");
  }
  const canonicalTarget = await realpath(target);
  if (!isInside(root, canonicalTarget)) {
    throw new Error("LIST_FOLDER 경로가 SOURCE_ROOT 밖을 가리킵니다.");
  }

  const entries: WorkerJsonRecord[] = [];
  for (const entry of await readdir(canonicalTarget, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (!entry.isDirectory() && !entry.isFile()) continue;
    if (foldersOnly && !entry.isDirectory()) continue;
    const entryRelativePath = relativePath ? path.posix.join(relativePath, entry.name) : entry.name;
    const metadata = foldersOnly ? null : await stat(path.join(canonicalTarget, entry.name));
    entries.push({
      name: entry.name,
      displayName: entry.name.normalize("NFC"),
      path: entryRelativePath,
      displayPath: toRemoteNasDisplayPath(entryRelativePath),
      type: entry.isDirectory() ? "folder" : "file",
      ...(entry.isFile() && metadata ? { size: metadata.size } : {}),
      modifiedAt: metadata ? metadata.mtime.toISOString() : null,
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

async function listPersonSelectFolder(payload: WorkerJsonRecord): Promise<WorkerJsonRecord> {
  const rootRequested = workerBooleanValue(payload, "root") === true;
  const requestedPath = workerStringValue(payload, "remote_path") ?? "";
  const virtualPath = normalizeRemoteNasRelativePath(requestedPath);
  if (rootRequested && virtualPath) {
    throw new Error("PERSON_SELECT_LIST_FOLDER의 root와 remote_path를 동시에 지정할 수 없습니다.");
  }
  const foldersOnly = workerBooleanValue(payload, "folders_only") === true;

  if (!virtualPath) {
    const entries = getPersonSelectRoots().map((root) => ({
      name: root.id,
      displayName: root.label,
      path: root.id,
      displayPath: root.label,
      type: "folder",
      modifiedAt: null,
    }));
    return { ok: true, root: "PERSON_SELECT_ROOTS", path: "", displayPath: "허용 폴더", entries };
  }

  const resolved = await resolvePersonSelectSourcePath(virtualPath);
  const entries: WorkerJsonRecord[] = [];
  try {
    for (const entry of await readdir(resolved.canonicalPath, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (!entry.isDirectory() && !entry.isFile()) continue;
      if (foldersOnly && !entry.isDirectory()) continue;
      const childAbsolutePath = path.join(resolved.canonicalPath, entry.name);
      const metadata = foldersOnly ? null : await stat(childAbsolutePath);
      const relativePath = path.relative(resolved.root.canonicalPath, childAbsolutePath).split(path.sep).join("/");
      const childPath = toPersonSelectVirtualPath(resolved.root, relativePath);
      entries.push({
        name: entry.name,
        displayName: entry.name.normalize("NFC"),
        path: childPath,
        displayPath: `${resolved.root.label}/${relativePath.split("/").map((part) => part.normalize("NFC")).join("/")}`,
        type: entry.isDirectory() ? "folder" : "file",
        ...(entry.isFile() && metadata ? { size: metadata.size } : {}),
        modifiedAt: metadata ? metadata.mtime.toISOString() : null,
      });
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as NodeJS.ErrnoException).code)
      : "";
    if (code === "EACCES" || code === "EPERM") throw new Error("이 폴더를 읽을 권한이 없어요.");
    if (code === "ENOENT" || code === "ENOTDIR") throw new Error("드라이브가 연결되어 있지 않아요.");
    throw error;
  }
  const displayPath = resolved.relativePath
    ? `${resolved.root.label}/${resolved.relativePath.split("/").map((part) => part.normalize("NFC")).join("/")}`
    : resolved.root.label;
  console.info(`[remote-bridge] PERSON_SELECT_LIST_FOLDER completed: ${virtualPath}`);
  return { ok: true, root: "PERSON_SELECT_ROOTS", path: virtualPath, displayPath, entries };
}

async function checkPhotoWorkFolder(payload: WorkerJsonRecord): Promise<WorkerJsonRecord> {
  const sourceFolderInput = workerStringValue(payload, "source_folder", true);
  if (!sourceFolderInput) throw new Error("NAS Root가 아닌 촬영 폴더를 선택해주세요.");
  const sourceFolder = normalizeRemoteNasRelativePath(sourceFolderInput);
  if (!sourceFolder) throw new Error("NAS Root가 아닌 촬영 폴더를 선택해주세요.");

  const roots = getStorageRoots();
  const workRoot = path.resolve(roots.workRoot);
  const workFolder = path.resolve(workRoot, ...sourceFolder.split("/").filter(Boolean));
  if (!isInside(workRoot, workFolder)) throw new Error("Agentstation 작업 폴더 경로가 안전하지 않습니다.");
  const jpgWorkFolder = path.join(workFolder, "JPG전체");

  let jpgWorkFolderExists = false;
  try {
    const metadata = await lstat(jpgWorkFolder);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`Agentstation JPG 작업 경로가 안전한 폴더가 아닙니다: ${jpgWorkFolder}`);
    }
    jpgWorkFolderExists = true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : null;
    if (code !== "ENOENT") throw error;
  }

  return { ok: true, sourceFolder, workFolder, jpgWorkFolder, jpgWorkFolderExists };
}

async function copyTest(): Promise<WorkerJsonRecord> {
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

export async function executeWorkerBuiltIn(
  job: BuiltInJob,
  options: BuiltInOptions,
): Promise<WorkerJsonRecord> {
  if (job.action === "PING") {
    return { ok: true, status: "PONG", workerId: options.workerId, at: new Date().toISOString() };
  }
  if (job.action === "COPY_TEST") return copyTest();
  if (job.action === "LIST_FOLDER") return listFolder(job.payload);
  if (job.action === "PERSON_SELECT_LIST_FOLDER") return listPersonSelectFolder(job.payload);
  if (job.action === "PHOTO_CHECK_WORK_FOLDER") return checkPhotoWorkFolder(job.payload);
  if (job.action === "PHOTO_RAW_MATCH_COPY") {
    return executeRemoteRawMatchCopy(job.payload as RemoteRawMatchCopyPayload, {
      shouldCancel: options.shouldCancel,
      onProgress: async (progress) => options.onProgress?.({
        stage: "copying",
        current: progress.current,
        total: progress.total,
        message: progress.message,
      }),
    });
  }
  throw new Error(`내장 실행기가 없는 action입니다: ${job.action}`);
}
