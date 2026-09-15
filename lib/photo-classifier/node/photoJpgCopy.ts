import { createHash } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  stat,
  statfs,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { JPG_PHOTO_EXTENSIONS, RAW_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import type { RunnerProgress, RunnerRoots } from "./types";
import { getStorageRoots } from "./storageConfig";

const JPG_DIRECTORY = "JPG전체";
const TEMP_SUFFIX = ".olivia-part";
const MANIFEST_DIRECTORY = ".olivia";
const DEFAULT_MIN_FREE_BYTES = 30 * 1024 ** 3;
const MIN_SAFETY_MARGIN_BYTES = 1024 ** 3;

export type PhotoStageJpgInput = {
  sourceRelativePath: string;
  destinationRelativePath?: string;
  roots?: RunnerRoots;
  minFreeBytes?: number;
  onProgress?: (progress: RunnerProgress) => void;
};

export type PhotoStageJpgSuccess = {
  ok: true;
  status: "COPY_COMPLETED";
  sourceRelativePath: string;
  projectRelativePath: string;
  destinationRelativePath: string;
  sourceCount: number;
  sourceBytes: number;
  destinationJpgCount: number;
  destinationJpgBytes: number;
  destinationBytes: number;
  copiedCount: number;
  copiedBytes: number;
  skippedCount: number;
  alreadyCopiedCount: number;
  rawCopiedCount: 0;
  durationMs: number;
  warnings: string[];
  manifestPath: string;
};

export type PhotoStageJpgFailure = {
  ok: false;
  status: "COPY_QUEUED" | "COPY_FAILED" | "REVIEW_REQUIRED";
  sourceRelativePath: string;
  projectRelativePath: string;
  destinationRelativePath: string;
  sourceCount: number;
  sourceBytes: number;
  destinationJpgCount: number;
  destinationJpgBytes: number;
  destinationBytes: number;
  copiedCount: number;
  copiedBytes: number;
  skippedCount: number;
  alreadyCopiedCount: number;
  rawCopiedCount: 0;
  durationMs: number;
  warnings: string[];
  error: string;
};

export type PhotoStageJpgResult = PhotoStageJpgSuccess | PhotoStageJpgFailure;

type FileSnapshot = { relativePath: string; name: string; sourcePath: string; size: number; mtimeMs: number };
type RawSnapshot = Map<string, { name: string; size: number; mtimeMs: number }>;
type Summary = { count: number; bytes: number };

class StageValidationError extends Error {
  constructor(public readonly status: "REVIEW_REQUIRED" | "COPY_FAILED", message: string) {
    super(message);
    this.name = "StageValidationError";
  }
}

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function normalizeRelative(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.includes("\\") || path.isAbsolute(value) || value.startsWith("/")) {
    throw new StageValidationError("REVIEW_REQUIRED", `${label}는 안전한 상대경로여야 합니다.`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new StageValidationError("REVIEW_REQUIRED", `${label}에 허용되지 않는 경로가 있습니다.`);
  }
  return segments.join("/");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function requireDirectory(target: string, label: string): Promise<string> {
  const metadata = await lstat(target).catch(() => null);
  if (!metadata) {
    const error = new Error(`${label}을 찾을 수 없습니다.`) as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
  if (metadata.isSymbolicLink()) throw new StageValidationError("REVIEW_REQUIRED", `${label}에 심볼릭 링크를 사용할 수 없습니다.`);
  if (!metadata.isDirectory()) throw new StageValidationError("REVIEW_REQUIRED", `${label}이(가) 폴더가 아닙니다.`);
  const canonical = await realpath(target);
  if (!(await stat(canonical)).isDirectory()) throw new StageValidationError("REVIEW_REQUIRED", `${label}이(가) 폴더가 아닙니다.`);
  return canonical;
}

async function collectSourceJpgs(directory: string): Promise<FileSnapshot[]> {
  const files: FileSnapshot[] = [];
  const visit = async (current: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const relativePath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
      if (entry.isSymbolicLink()) throw new StageValidationError("REVIEW_REQUIRED", `SSD1 JPG전체에 심볼릭 링크가 있습니다: ${relativePath}`);
      if (entry.isDirectory()) {
        await visit(fullPath, relativePath);
        continue;
      }
      if (!entry.isFile()) throw new StageValidationError("REVIEW_REQUIRED", `JPG전체에 일반 파일이 아닌 항목이 있습니다: ${relativePath}`);
      const fileExtension = extension(entry.name);
      if (RAW_PHOTO_EXTENSIONS.has(fileExtension)) throw new StageValidationError("REVIEW_REQUIRED", `JPG전체에 RAW 파일이 섞여 있습니다: ${relativePath}`);
      if (!JPG_PHOTO_EXTENSIONS.has(fileExtension)) throw new StageValidationError("REVIEW_REQUIRED", `JPG/JPEG가 아닌 파일이 JPG전체에 있습니다: ${relativePath}`);
      const metadata = await stat(fullPath);
      files.push({ relativePath, name: entry.name, sourcePath: fullPath, size: metadata.size, mtimeMs: metadata.mtimeMs });
    }
  };
  await visit(directory, "");
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true, sensitivity: "base" }));
}

async function collectRawSnapshot(projectRoot: string): Promise<RawSnapshot> {
  const snapshot: RawSnapshot = new Map();
  const visit = async (current: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const relativePath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
      if (entry.isSymbolicLink()) throw new StageValidationError("REVIEW_REQUIRED", `RAW 검사 중 심볼릭 링크가 있습니다: ${relativePath}`);
      if (entry.isDirectory()) {
        if (!relativeDirectory && entry.name === JPG_DIRECTORY) continue;
        await visit(fullPath, relativePath);
        continue;
      }
      if (!entry.isFile() || !RAW_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      snapshot.set(relativePath, { name: entry.name, size: metadata.size, mtimeMs: metadata.mtimeMs });
    }
  };
  await visit(projectRoot, "");
  return snapshot;
}

function summary(files: FileSnapshot[]): Summary {
  return { count: files.length, bytes: files.reduce((total, file) => total + file.size, 0) };
}

function sameFileSnapshots(before: FileSnapshot[], after: FileSnapshot[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((file, index) => {
    const current = after[index];
    return Boolean(current) && current.relativePath === file.relativePath && current.name === file.name && current.size === file.size && current.mtimeMs === file.mtimeMs;
  });
}

function sameRawSnapshot(before: RawSnapshot, after: RawSnapshot): boolean {
  if (before.size !== after.size) return false;
  for (const [relativePath, value] of before) {
    const current = after.get(relativePath);
    if (!current || current.name !== value.name || current.size !== value.size || current.mtimeMs !== value.mtimeMs) return false;
  }
  return true;
}

function totalBytes(files: Iterable<{ size: number }>): number {
  let total = 0;
  for (const file of files) total += file.size;
  return total;
}

function tempFinalPath(relativePath: string): string | null {
  const base = path.posix.basename(relativePath);
  if (!base.startsWith(".") || !base.endsWith(TEMP_SUFFIX)) return null;
  const original = base.slice(1, -TEMP_SUFFIX.length);
  if (!original || !JPG_PHOTO_EXTENSIONS.has(extension(original))) return null;
  const directory = path.posix.dirname(relativePath);
  return directory === "." ? original : path.posix.join(directory, original);
}

type DestinationInspection = { files: Map<string, FileSnapshot>; tempFiles: string[]; conflicts: string[] };

async function inspectDestination(directory: string, sourceFiles: Map<string, FileSnapshot>): Promise<DestinationInspection> {
  const files = new Map<string, FileSnapshot>();
  const tempFiles: string[] = [];
  const conflicts: string[] = [];
  const metadata = await lstat(directory).catch(() => null);
  if (!metadata) return { files, tempFiles, conflicts };
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new StageValidationError("REVIEW_REQUIRED", "SSD2 JPG전체가 안전한 폴더가 아닙니다.");
  const visit = async (current: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const relativePath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
      if (!relativeDirectory && entry.name === MANIFEST_DIRECTORY) {
        if (entry.isSymbolicLink() || !entry.isDirectory()) conflicts.push(`SSD2 상태 폴더가 안전하지 않습니다: ${entry.name}`);
        continue;
      }
      if (entry.isSymbolicLink()) {
        conflicts.push(`SSD2 JPG전체에 심볼릭 링크가 있습니다: ${relativePath}`);
        continue;
      }
      if (entry.isDirectory()) {
        await visit(fullPath, relativePath);
        continue;
      }
      if (!entry.isFile()) {
        conflicts.push(`SSD2 JPG전체에 일반 파일이 아닌 항목이 있습니다: ${relativePath}`);
        continue;
      }
      const finalPath = tempFinalPath(relativePath);
      if (finalPath) {
        if (sourceFiles.has(finalPath)) tempFiles.push(relativePath);
        else conflicts.push(`Olivia가 만든 것으로 확인할 수 없는 임시 파일입니다: ${relativePath}`);
        continue;
      }
      const fileExtension = extension(entry.name);
      if (RAW_PHOTO_EXTENSIONS.has(fileExtension)) conflicts.push(`SSD2 JPG전체에 RAW 파일이 있습니다: ${relativePath}`);
      else if (!JPG_PHOTO_EXTENSIONS.has(fileExtension)) conflicts.push(`SSD2 JPG전체에 허용되지 않은 파일이 있습니다: ${relativePath}`);
      else {
        const fileMetadata = await stat(fullPath);
        files.set(relativePath, { relativePath, name: entry.name, sourcePath: fullPath, size: fileMetadata.size, mtimeMs: fileMetadata.mtimeMs });
      }
    }
  };
  await visit(directory, "");
  return { files, tempFiles, conflicts };
}

async function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

async function ensureDirectoryTree(root: string, target: string): Promise<void> {
  if (!isInside(root, target)) throw new StageValidationError("REVIEW_REQUIRED", "SSD2 목적지가 WORK_ROOT 밖입니다.");
  const relative = path.relative(root, target);
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const existing = await lstat(cursor).catch(() => null);
    if (existing) {
      if (existing.isSymbolicLink() || !existing.isDirectory()) throw new StageValidationError("REVIEW_REQUIRED", `SSD2 경로가 안전한 폴더가 아닙니다: ${segment}`);
    } else await mkdir(cursor);
    if (!isInside(root, await realpath(cursor))) throw new StageValidationError("REVIEW_REQUIRED", "SSD2 경로가 WORK_ROOT 밖을 가리킵니다.");
  }
}

function configuredMinFreeBytes(): number {
  const configured = process.env.OLIVIA_WORK_MIN_FREE_GB?.trim();
  if (!configured) return DEFAULT_MIN_FREE_BYTES;
  const gb = Number(configured);
  if (!Number.isFinite(gb) || gb < 0) throw new Error("OLIVIA_WORK_MIN_FREE_GB는 0 이상의 숫자여야 합니다.");
  return gb * 1024 ** 3;
}

async function writeManifest(projectDirectory: string, data: Record<string, unknown>): Promise<string> {
  const stateDirectory = path.join(projectDirectory, MANIFEST_DIRECTORY);
  await ensureDirectoryTree(path.dirname(projectDirectory), stateDirectory);
  const manifest = path.join(stateDirectory, "copy-manifest.json");
  const temporary = path.join(stateDirectory, ".copy-manifest.json.tmp");
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, manifest);
  return path.posix.join(MANIFEST_DIRECTORY, "copy-manifest.json");
}

function makeFailure(input: {
  status: PhotoStageJpgFailure["status"], sourceRelativePath: string, destinationRelativePath: string, sourceFiles: FileSnapshot[], destinationCount?: number, destinationBytes?: number,
  copiedCount: number, copiedBytes: number, skippedCount: number, warnings: string[], startedAt: number, error: string;
}): PhotoStageJpgFailure {
  const sourceSummary = summary(input.sourceFiles);
  return {
    ok: false, status: input.status, sourceRelativePath: input.sourceRelativePath, projectRelativePath: input.sourceRelativePath, destinationRelativePath: input.destinationRelativePath,
    sourceCount: sourceSummary.count, sourceBytes: sourceSummary.bytes, destinationJpgCount: input.destinationCount ?? 0, destinationJpgBytes: input.destinationBytes ?? 0, destinationBytes: input.destinationBytes ?? 0,
    copiedCount: input.copiedCount, copiedBytes: input.copiedBytes, skippedCount: input.skippedCount, alreadyCopiedCount: input.skippedCount, rawCopiedCount: 0,
    durationMs: Date.now() - input.startedAt, warnings: input.warnings, error: input.error,
  };
}

/** SSD1/JPG전체를 SSD2/<project>/JPG전체로 COPY하는 PHASE 3 실행기. */
export async function stageProjectJpgToWorkStorage(input: PhotoStageJpgInput): Promise<PhotoStageJpgResult> {
  const startedAt = Date.now();
  const sourceRelativePath = normalizeRelative(input.sourceRelativePath, "source_relative_path");
  const destinationRelativePath = normalizeRelative(input.destinationRelativePath ?? sourceRelativePath, "destination_relative_path");
  const roots = input.roots ?? getStorageRoots();
  const warnings: string[] = [];
  let sourceFiles: FileSnapshot[] = [];
  let destinationCount = 0;
  let destinationBytes = 0;
  let copiedCount = 0;
  let copiedBytes = 0;
  let skippedCount = 0;
  try {
    input.onProgress?.({ stage: "PREPARING", message: "SSD1 JPG전체와 Agentstation 작업 공간을 사전 확인하는 중입니다." });
    const sourceRoot = await requireDirectory(roots.sourceRoot, "SOURCE_ROOT");
    const workRoot = await requireDirectory(roots.workRoot, "WORK_ROOT");
    if (sourceRoot === workRoot || isInside(sourceRoot, workRoot) || isInside(workRoot, sourceRoot)) throw new StageValidationError("REVIEW_REQUIRED", "SOURCE_ROOT과 WORK_ROOT은 서로 겹치지 않는 Storage여야 합니다.");
    const sourceProject = path.resolve(sourceRoot, ...sourceRelativePath.split("/"));
    const destinationProject = path.resolve(workRoot, ...destinationRelativePath.split("/"));
    if (!isInside(sourceRoot, sourceProject) || !isInside(workRoot, destinationProject)) throw new StageValidationError("REVIEW_REQUIRED", "프로젝트 경로가 Storage Root 밖입니다.");
    const sourceProjectCanonical = await requireDirectory(sourceProject, "SSD1 프로젝트");
    if (!isInside(sourceRoot, sourceProjectCanonical)) throw new StageValidationError("REVIEW_REQUIRED", "SSD1 프로젝트가 SOURCE_ROOT 밖을 가리킵니다.");
    const sourceJpgDirectory = await requireDirectory(path.join(sourceProjectCanonical, JPG_DIRECTORY), "SSD1 JPG전체");
    if (!isInside(sourceProjectCanonical, sourceJpgDirectory)) throw new StageValidationError("REVIEW_REQUIRED", "SSD1 JPG전체가 프로젝트 밖을 가리킵니다.");
    sourceFiles = await collectSourceJpgs(sourceJpgDirectory);
    const sourceSummary = summary(sourceFiles);
    if (sourceSummary.count === 0) throw new StageValidationError("REVIEW_REQUIRED", "SSD1 JPG전체에 복사할 JPG 파일이 없습니다.");
    const sourceMap = new Map(sourceFiles.map((file) => [file.relativePath, file]));
    const rawBefore = await collectRawSnapshot(sourceProjectCanonical);
    const destinationDirectory = path.join(destinationProject, JPG_DIRECTORY);
    const inspection = await inspectDestination(destinationDirectory, sourceMap);
    if (inspection.conflicts.length) return makeFailure({ status: "REVIEW_REQUIRED", sourceRelativePath, destinationRelativePath, sourceFiles, destinationCount: inspection.files.size, destinationBytes: totalBytes(inspection.files.values()), copiedCount, copiedBytes, skippedCount, warnings, startedAt, error: inspection.conflicts.join("; ") });
    for (const [relativePath, destinationFile] of inspection.files) {
      const sourceFile = sourceMap.get(relativePath);
      if (!sourceFile) throw new StageValidationError("REVIEW_REQUIRED", `SSD2에 예상하지 않은 JPG가 있습니다: ${relativePath}`);
      if (sourceFile.size !== destinationFile.size || await sha256(sourceFile.sourcePath) !== await sha256(destinationFile.sourcePath)) throw new StageValidationError("REVIEW_REQUIRED", `동일 파일명의 내용이 다른 SSD2 파일이 있습니다: ${relativePath}`);
      skippedCount += 1;
    }
    const pending = sourceFiles.filter((file) => !inspection.files.has(file.relativePath));
    if (pending.length > 0) {
      const filesystem = await statfs(workRoot);
      const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
      const safetyMargin = Math.max(sourceSummary.bytes * 0.05, MIN_SAFETY_MARGIN_BYTES, input.minFreeBytes ?? configuredMinFreeBytes());
      if (!Number.isFinite(availableBytes) || availableBytes < sourceSummary.bytes + safetyMargin) return makeFailure({ status: "COPY_FAILED", sourceRelativePath, destinationRelativePath, sourceFiles, destinationCount: inspection.files.size, destinationBytes: totalBytes(inspection.files.values()), copiedCount, copiedBytes, skippedCount, warnings, startedAt, error: `Agentstation 저장 공간이 부족합니다. 현재 여유 ${(availableBytes / 1024 ** 3).toFixed(1)}GB, 필요 ${(sourceSummary.bytes / 1024 ** 3).toFixed(1)}GB + 안전 여유 ${(safetyMargin / 1024 ** 3).toFixed(1)}GB` });
    }
    for (const temporaryRelativePath of inspection.tempFiles) await unlink(path.join(destinationDirectory, ...temporaryRelativePath.split("/")));
    await ensureDirectoryTree(workRoot, destinationDirectory);
    const currentSourceFiles = await collectSourceJpgs(sourceJpgDirectory);
    if (!sameFileSnapshots(sourceFiles, currentSourceFiles) || !sameRawSnapshot(rawBefore, await collectRawSnapshot(sourceProjectCanonical))) throw new StageValidationError("REVIEW_REQUIRED", "복사 시작 전 SSD1 원본이 변경되었습니다.");
    let copiedBytesForProgress = totalBytes(sourceFiles.filter((file) => inspection.files.has(file.relativePath)));
    if (pending.length > 0) input.onProgress?.({ stage: "COPYING", current: skippedCount, total: sourceSummary.count, copiedBytes: copiedBytesForProgress, totalBytes: sourceSummary.bytes, message: "Agentstation으로 JPG 복사 중입니다." });
    for (const file of pending) {
      const destinationPath = path.join(destinationDirectory, ...file.relativePath.split("/"));
      const destinationParent = path.dirname(destinationPath);
      await ensureDirectoryTree(workRoot, destinationParent);
      if (await lstat(destinationPath).catch(() => null)) throw new StageValidationError("REVIEW_REQUIRED", `복사 중 동일 파일이 생겼습니다: ${file.relativePath}`);
      const temporaryPath = path.join(destinationParent, `.${path.basename(file.relativePath)}${TEMP_SUFFIX}`);
      try {
        await copyFile(file.sourcePath, temporaryPath, fsConstants.COPYFILE_EXCL);
        const [sourceAfter, temporaryAfter] = await Promise.all([stat(file.sourcePath), stat(temporaryPath)]);
        if (sourceAfter.size !== file.size || sourceAfter.mtimeMs !== file.mtimeMs || temporaryAfter.size !== file.size) throw new StageValidationError("COPY_FAILED", `복사 중 SSD1 원본 또는 임시 파일 검증에 실패했습니다: ${file.relativePath}`);
        await utimes(temporaryPath, sourceAfter.atime, sourceAfter.mtime);
        if (await lstat(destinationPath).catch(() => null)) throw new StageValidationError("REVIEW_REQUIRED", `최종 파일명이 이미 존재합니다: ${file.relativePath}`);
        await rename(temporaryPath, destinationPath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
      copiedCount += 1;
      copiedBytes += file.size;
      copiedBytesForProgress += file.size;
      input.onProgress?.({ stage: "COPYING", current: skippedCount + copiedCount, total: sourceSummary.count, copiedBytes: copiedBytesForProgress, totalBytes: sourceSummary.bytes, message: `JPG 복사: ${file.relativePath}` });
    }
    input.onProgress?.({ stage: "VERIFYING", current: 0, total: sourceSummary.count, copiedBytes: sourceSummary.bytes, totalBytes: sourceSummary.bytes, message: "SSD1 원본과 Agentstation 복사 결과를 검증 중입니다." });
    const rawAfter = await collectRawSnapshot(sourceProjectCanonical);
    const latestSourceFiles = await collectSourceJpgs(sourceJpgDirectory);
    if (!sameFileSnapshots(sourceFiles, latestSourceFiles) || !sameRawSnapshot(rawBefore, rawAfter)) throw new StageValidationError("REVIEW_REQUIRED", "COPY 후 SSD1 JPG 또는 RAW 원본이 변경되었습니다.");
    const finalInspection = await inspectDestination(destinationDirectory, sourceMap);
    if (finalInspection.conflicts.length) throw new StageValidationError("COPY_FAILED", finalInspection.conflicts.join("; "));
    if (finalInspection.tempFiles.length) throw new StageValidationError("COPY_FAILED", "Agentstation에 Olivia 임시 파일이 남아 있습니다.");
    if (finalInspection.files.size !== sourceSummary.count) throw new StageValidationError("COPY_FAILED", "Agentstation JPG 파일 수 검증에 실패했습니다.");
    for (const [relativePath, sourceFile] of sourceMap) {
      const destinationFile = finalInspection.files.get(relativePath);
      if (!destinationFile || destinationFile.size !== sourceFile.size) throw new StageValidationError("COPY_FAILED", `Agentstation 파일 검증에 실패했습니다: ${relativePath}`);
    }
    destinationCount = finalInspection.files.size;
    destinationBytes = totalBytes(finalInspection.files.values());
    if (destinationBytes !== sourceSummary.bytes) throw new StageValidationError("COPY_FAILED", "Agentstation 전체 용량 검증에 실패했습니다.");
    input.onProgress?.({ stage: "VERIFYING", current: sourceSummary.count, total: sourceSummary.count, copiedBytes: sourceSummary.bytes, totalBytes: sourceSummary.bytes, message: "JPG 복사 검증이 완료되었습니다." });
    const manifestPath = await writeManifest(destinationProject, { projectRelativePath: destinationRelativePath, sourceJpgCount: sourceSummary.count, sourceBytes: sourceSummary.bytes, destinationJpgCount: destinationCount, destinationBytes, copiedCount, alreadyCopiedCount: skippedCount, rawCopiedCount: 0, startedAt: new Date(startedAt).toISOString(), completedAt: new Date().toISOString(), status: "COPY_COMPLETED" });
    return { ok: true, status: "COPY_COMPLETED", sourceRelativePath, projectRelativePath: sourceRelativePath, destinationRelativePath, sourceCount: sourceSummary.count, sourceBytes: sourceSummary.bytes, destinationJpgCount: destinationCount, destinationJpgBytes: destinationBytes, destinationBytes, copiedCount, copiedBytes, skippedCount, alreadyCopiedCount: skippedCount, rawCopiedCount: 0, durationMs: Date.now() - startedAt, warnings, manifestPath: path.posix.join(destinationRelativePath, manifestPath) };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof StageValidationError ? error.status : ["ENOENT", "ENOTCONN", "ENODEV", "EIO", "ESTALE"].includes(code ?? "") ? "COPY_QUEUED" : "COPY_FAILED";
    return makeFailure({ status, sourceRelativePath, destinationRelativePath, sourceFiles, destinationCount, destinationBytes, copiedCount, copiedBytes, skippedCount, warnings, startedAt, error: message });
  }
}
