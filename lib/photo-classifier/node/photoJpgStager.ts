import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, readdir, realpath, stat, statfs, utimes } from "node:fs/promises";
import path from "node:path";
import { JPG_PHOTO_EXTENSIONS, RAW_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import type { RunnerProgress, RunnerRoots } from "./types";
import { getStorageRoots } from "./storageConfig";

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
  destinationRelativePath: string;
  sourceCount: number;
  sourceBytes: number;
  copiedCount: number;
  copiedBytes: number;
  skippedCount: number;
  durationMs: number;
  warnings: string[];
};

export type PhotoStageJpgFailure = {
  ok: false;
  status: "COPY_QUEUED" | "COPY_FAILED" | "REVIEW_REQUIRED";
  sourceRelativePath: string;
  destinationRelativePath: string;
  sourceCount: number;
  sourceBytes: number;
  copiedCount: number;
  copiedBytes: number;
  skippedCount: number;
  durationMs: number;
  warnings: string[];
  error: string;
};

export type PhotoStageJpgResult = PhotoStageJpgSuccess | PhotoStageJpgFailure;

type JpgFile = { name: string; sourcePath: string; size: number; mtimeMs: number };
type FileSummary = { count: number; bytes: number };

const DEFAULT_MIN_FREE_BYTES = 30 * 1024 ** 3;

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function safeRelative(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.includes("\\") || path.isAbsolute(value)) {
    throw new Error(`${label}는 안전한 상대경로여야 합니다.`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label}에 허용되지 않는 경로가 있습니다.`);
  }
  return value;
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function requireDirectory(target: string, label: string): Promise<string> {
  const metadata = await lstat(target).catch(() => null);
  if (!metadata) throw new Error(`${label}을 찾을 수 없습니다.`);
  if (metadata.isSymbolicLink()) throw new Error(`${label}은(는) 심볼릭 링크일 수 없습니다.`);
  if (!metadata.isDirectory()) throw new Error(`${label}이(가) 폴더가 아닙니다.`);
  const canonical = await realpath(target);
  const canonicalMetadata = await stat(canonical);
  if (!canonicalMetadata.isDirectory()) throw new Error(`${label}이(가) 폴더가 아닙니다.`);
  return canonical;
}

async function ensureDestinationParent(workRoot: string, destination: string): Promise<void> {
  const parent = path.dirname(destination);
  if (!inside(workRoot, parent) && parent !== workRoot) throw new Error("작업 목적지가 WORK_ROOT 밖입니다.");
  const relative = path.relative(workRoot, parent);
  let cursor = workRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const existing = await lstat(cursor).catch(() => null);
    if (existing) {
      if (existing.isSymbolicLink() || !existing.isDirectory()) throw new Error("작업 목적지 상위 폴더가 안전하지 않습니다.");
    } else {
      await mkdir(cursor);
    }
  }
}

async function listSourceJpgs(directory: string, warnings: string[]): Promise<JpgFile[]> {
  const files: JpgFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`JPG원본에 심볼릭 링크가 있습니다: ${entry.name}`);
    if (!entry.isFile()) {
      if (entry.isDirectory()) warnings.push(`JPG원본 하위 폴더를 건너뜀: ${entry.name}`);
      continue;
    }
    const fileExtension = extension(entry.name);
    if (RAW_PHOTO_EXTENSIONS.has(fileExtension)) {
      warnings.push(`RAW 파일을 복사하지 않고 건너뜀: ${entry.name}`);
      continue;
    }
    if (!JPG_PHOTO_EXTENSIONS.has(fileExtension)) continue;
    const sourcePath = path.join(directory, entry.name);
    const metadata = await stat(sourcePath);
    files.push({ name: entry.name, sourcePath, size: metadata.size, mtimeMs: metadata.mtimeMs });
  }
  return files.sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true, sensitivity: "base" }));
}

async function inspectDestination(directory: string, sourceFiles: JpgFile[]): Promise<{ existing: boolean; sizes: Map<string, number>; conflicts: string[] }> {
  const metadata = await lstat(directory).catch(() => null);
  if (!metadata) return { existing: false, sizes: new Map(), conflicts: [] };
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("SSD2 목적지가 안전한 폴더가 아닙니다.");
  const sourceNames = new Set(sourceFiles.map((file) => file.name));
  const sizes = new Map<string, number>();
  const conflicts: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isFile()) {
      conflicts.push(`목적지에 허용되지 않은 항목: ${entry.name}`);
      continue;
    }
    if (!sourceNames.has(entry.name)) {
      conflicts.push(`목적지에 예상하지 않은 파일: ${entry.name}`);
      continue;
    }
    const size = (await stat(path.join(directory, entry.name))).size;
    sizes.set(entry.name, size);
    const source = sourceFiles.find((file) => file.name === entry.name);
    if (source && source.size !== size) conflicts.push(`동일 파일명의 크기가 다름: ${entry.name}`);
  }
  return { existing: true, sizes, conflicts };
}

async function verifySourceSnapshot(sourceFiles: JpgFile[]): Promise<void> {
  for (const file of sourceFiles) {
    const metadata = await stat(file.sourcePath);
    if (metadata.size !== file.size || metadata.mtimeMs !== file.mtimeMs) {
      throw new Error(`${file.name} 복사 중 SSD1 원본이 변경되었습니다.`);
    }
  }
}

function hasSameSourceSnapshot(before: JpgFile[], after: JpgFile[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((file, index) => {
    const current = after[index];
    return Boolean(current)
      && current.name === file.name
      && current.size === file.size
      && current.mtimeMs === file.mtimeMs;
  });
}

function minFreeBytesFromEnv(): number {
  const configured = process.env.OLIVIA_WORK_MIN_FREE_GB?.trim();
  if (!configured) return DEFAULT_MIN_FREE_BYTES;
  const gb = Number(configured);
  if (!Number.isFinite(gb) || gb < 0) throw new Error("OLIVIA_WORK_MIN_FREE_GB는 0 이상의 숫자여야 합니다.");
  return gb * 1024 ** 3;
}

function summary(files: JpgFile[]): FileSummary {
  return { count: files.length, bytes: files.reduce((total, file) => total + file.size, 0) };
}

export async function stageProjectJpgToWorkStorage(input: PhotoStageJpgInput): Promise<PhotoStageJpgResult> {
  const startedAt = Date.now();
  const roots = input.roots ?? getStorageRoots();
  const sourceRelativePath = safeRelative(input.sourceRelativePath, "source_relative_path");
  const destinationRelativePath = safeRelative(input.destinationRelativePath ?? sourceRelativePath, "destination_relative_path");
  const warnings: string[] = [];
  let sourceFiles: JpgFile[] = [];
  let copiedCount = 0;
  let copiedBytes = 0;
  let skippedCount = 0;
  const fail = (status: PhotoStageJpgFailure["status"], error: string): PhotoStageJpgFailure => ({
    ok: false, status, sourceRelativePath, destinationRelativePath,
    sourceCount: sourceFiles.length, sourceBytes: summary(sourceFiles).bytes,
    copiedCount, copiedBytes, skippedCount, durationMs: Date.now() - startedAt, warnings, error,
  });

  try {
    input.onProgress?.({ stage: "PREPARING", message: "SSD1 JPG원본과 SSD2 작업 공간을 확인하는 중입니다." });
    const sourceRoot = await requireDirectory(roots.sourceRoot, "SOURCE_ROOT");
    const workRoot = await requireDirectory(roots.workRoot, "WORK_ROOT");
    if (sourceRoot === workRoot || inside(sourceRoot, workRoot) || inside(workRoot, sourceRoot)) {
      throw new Error("SOURCE_ROOT과 WORK_ROOT은 서로 겹치지 않는 Storage여야 합니다.");
    }
    const sourceProject = path.resolve(sourceRoot, ...sourceRelativePath.split("/"));
    const destination = path.resolve(workRoot, ...destinationRelativePath.split("/"));
    if (!inside(sourceRoot, sourceProject) || !inside(workRoot, destination)) throw new Error("프로젝트 경로가 Storage Root 밖입니다.");
    const sourceProjectCanonical = await requireDirectory(sourceProject, "SOURCE 프로젝트");
    if (!inside(sourceRoot, sourceProjectCanonical)) throw new Error("SOURCE 프로젝트가 SOURCE_ROOT 밖을 가리킵니다.");
    const sourceJpgDirectory = path.join(sourceProjectCanonical, "JPG원본");
    const sourceJpgCanonical = await requireDirectory(sourceJpgDirectory, "JPG원본");
    if (!inside(sourceProjectCanonical, sourceJpgCanonical)) throw new Error("JPG원본이 SOURCE 프로젝트 밖을 가리킵니다.");
    sourceFiles = await listSourceJpgs(sourceJpgCanonical, warnings);
    const sourceSummary = summary(sourceFiles);
    if (sourceSummary.count === 0) return fail("COPY_FAILED", "JPG원본에 복사할 JPG 파일이 없습니다.");

    const destinationInspection = await inspectDestination(destination, sourceFiles);
    if (destinationInspection.conflicts.length) return fail("REVIEW_REQUIRED", destinationInspection.conflicts.join("; "));
    const pending = sourceFiles.filter((file) => !destinationInspection.sizes.has(file.name));
    skippedCount = sourceFiles.length - pending.length;
    skippedCount = Math.max(0, skippedCount);
    if (pending.length === 0) {
      input.onProgress?.({ stage: "VERIFYING", current: sourceSummary.count, total: sourceSummary.count, copiedBytes: sourceSummary.bytes, totalBytes: sourceSummary.bytes, message: "기존 SSD2 복사 결과를 확인하는 중입니다." });
      await verifySourceSnapshot(sourceFiles);
      const latestSourceFiles = await listSourceJpgs(sourceJpgCanonical, warnings);
      if (!hasSameSourceSnapshot(sourceFiles, latestSourceFiles)) return fail("COPY_FAILED", "복사 확인 중 SSD1 JPG원본이 변경되었습니다.");
      const destinationFiles = await inspectDestination(destination, sourceFiles);
      if (destinationFiles.conflicts.length || destinationFiles.sizes.size !== sourceSummary.count) return fail("COPY_FAILED", "SSD2 기존 staging 검증에 실패했습니다.");
      return {
        ok: true, status: "COPY_COMPLETED", sourceRelativePath, destinationRelativePath,
        sourceCount: sourceSummary.count, sourceBytes: sourceSummary.bytes,
        copiedCount: 0, copiedBytes: 0, skippedCount: sourceSummary.count,
        durationMs: Date.now() - startedAt, warnings,
      };
    }

    const filesystem = await statfs(workRoot);
    const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
    const requiredBytes = sourceSummary.bytes;
    const minimumFreeBytes = input.minFreeBytes ?? minFreeBytesFromEnv();
    if (!Number.isFinite(availableBytes) || availableBytes < requiredBytes + minimumFreeBytes) {
      return fail("COPY_FAILED", `Olivia 작업 SSD의 여유공간이 부족합니다. 현재 여유 ${(availableBytes / 1024 ** 3).toFixed(1)}GB, 필요 ${(requiredBytes / 1024 ** 3).toFixed(1)}GB + 안전 여유 ${(minimumFreeBytes / 1024 ** 3).toFixed(1)}GB`);
    }

    await ensureDestinationParent(workRoot, destination);
    const destinationMetadata = await lstat(destination).catch(() => null);
    if (!destinationMetadata) await mkdir(destination);
    else if (destinationMetadata.isSymbolicLink() || !destinationMetadata.isDirectory()) return fail("REVIEW_REQUIRED", "SSD2 목적지가 폴더가 아닙니다.");

    input.onProgress?.({ stage: "COPYING", current: skippedCount, total: sourceSummary.count, copiedBytes: skippedCount ? sourceFiles.filter((file) => destinationInspection.sizes.has(file.name)).reduce((total, file) => total + file.size, 0) : 0, totalBytes: sourceSummary.bytes, message: "JPG를 SSD2 작업 저장소로 복사 중입니다." });
    for (const file of pending) {
      const destinationPath = path.join(destination, file.name);
      try {
        await copyFile(file.sourcePath, destinationPath, fsConstants.COPYFILE_EXCL);
        const sourceAfter = await stat(file.sourcePath);
        const destinationAfter = await stat(destinationPath);
        if (sourceAfter.size !== file.size || sourceAfter.mtimeMs !== file.mtimeMs || destinationAfter.size !== file.size) {
          throw new Error(`${file.name} 복사 중 원본이 변경되었거나 크기 검증에 실패했습니다.`);
        }
        await utimes(destinationPath, new Date(sourceAfter.atimeMs), new Date(sourceAfter.mtimeMs));
        copiedCount += 1;
        copiedBytes += file.size;
        input.onProgress?.({ stage: "COPYING", current: skippedCount + copiedCount, total: sourceSummary.count, copiedBytes: sourceFiles.filter((source) => destinationInspection.sizes.has(source.name)).reduce((total, source) => total + source.size, 0) + copiedBytes, totalBytes: sourceSummary.bytes, message: `JPG 복사: ${file.name}` });
      } catch (error) {
        return fail("COPY_FAILED", error instanceof Error ? error.message : String(error));
      }
    }

    input.onProgress?.({ stage: "VERIFYING", current: 0, total: sourceSummary.count, copiedBytes: sourceSummary.bytes, totalBytes: sourceSummary.bytes, message: "SSD2 복사 결과를 검증 중입니다." });
    await verifySourceSnapshot(sourceFiles);
    const latestSourceFiles = await listSourceJpgs(sourceJpgCanonical, warnings);
    if (!hasSameSourceSnapshot(sourceFiles, latestSourceFiles)) return fail("COPY_FAILED", "복사 중 SSD1 JPG원본이 변경되었습니다. 원본은 변경되지 않았습니다.");
    const destinationFiles = await inspectDestination(destination, sourceFiles);
    if (destinationFiles.conflicts.length || destinationFiles.sizes.size !== sourceSummary.count) return fail("COPY_FAILED", "SSD2 복사 후 파일 목록 검증에 실패했습니다.");
    const destinationBytes = [...destinationFiles.sizes.values()].reduce((total, size) => total + size, 0);
    if (destinationBytes !== sourceSummary.bytes) return fail("COPY_FAILED", "SSD2 복사 후 전체 용량 검증에 실패했습니다.");
    input.onProgress?.({ stage: "VERIFYING", current: sourceSummary.count, total: sourceSummary.count, copiedBytes: sourceSummary.bytes, totalBytes: sourceSummary.bytes, message: "JPG 복사 검증이 완료되었습니다." });
    return {
      ok: true, status: "COPY_COMPLETED", sourceRelativePath, destinationRelativePath,
      sourceCount: sourceSummary.count, sourceBytes: sourceSummary.bytes,
      copiedCount, copiedBytes, skippedCount, durationMs: Date.now() - startedAt, warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error && typeof error === "object" && "code" in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    // 볼륨이 잠깐 빠진 경우에는 실패로 확정하지 않고 다음 Worker poll에서
    // 다시 시도할 수 있도록 큐 상태를 유지한다.
    if (
      message.includes("SOURCE_ROOT을 찾을 수 없습니다.")
      || message.includes("WORK_ROOT을 찾을 수 없습니다.")
      || ["ENOENT", "ENOTCONN", "ENODEV", "EIO", "ESTALE"].includes(code ?? "")
    ) {
      return fail("COPY_QUEUED", message);
    }
    return fail("COPY_FAILED", message);
  }
}
