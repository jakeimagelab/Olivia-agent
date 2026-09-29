import {
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { JPG_PHOTO_EXTENSIONS, RAW_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import { getStorageRoots } from "./storageConfig";
import { JPG_INTEGRATED_DIRECTORY } from "./storageLayout";
import type { RunnerProgress, RunnerRoots } from "./types";

function normalizedName(value: string): string {
  return value.normalize("NFC");
}

function isIntegratedDirectoryName(value: string): boolean {
  return normalizedName(value) === normalizedName(JPG_INTEGRATED_DIRECTORY);
}

export type SourceJpgConflict = {
  source: string;
  destination: string;
  reason: "destination_exists" | "duplicate_filename" | "unsafe_destination";
};

export type SourceProjectPrepResult = {
  projectPath: string;
  projectRoot: string;
  jpgMoved: number;
  jpgAlreadyPrepared: number;
  rawUntouched: number;
  conflicts: SourceJpgConflict[];
  status: "JPG_MERGE_COMPLETED" | "REVIEW_REQUIRED" | "JPG_MERGE_FAILED";
};

type SourceProjectPrepOptions = {
  roots?: RunnerRoots;
  onProgress?: (progress: RunnerProgress) => void;
};

type SourceJpg = { source: string; relativePath: string; name: string; size: number; mtimeMs: number };
type RawSnapshot = Map<string, { name: string; size: number; mtimeMs: number }>;

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function assertWithin(root: string, candidate: string, label: string): void {
  if (!isWithin(root, candidate)) throw new Error(`${label} 경로가 SOURCE_ROOT 밖을 가리킵니다.`);
}

function normalizeProjectPath(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("project 경로가 필요합니다.");
  if (value.includes("\0") || path.isAbsolute(value) || value.startsWith("/") || value.includes("\\")) {
    throw new Error("project 경로는 SOURCE_ROOT 기준 상대경로여야 합니다.");
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("project 경로가 올바르지 않습니다.");
  }
  return segments.join(path.sep);
}

async function requireDirectory(directoryPath: string, label: string, rejectSymlink = false): Promise<string> {
  const metadata = await lstat(directoryPath).catch(() => {
    throw new Error(`${label}을 찾을 수 없습니다: ${directoryPath}`);
  });
  if (rejectSymlink && metadata.isSymbolicLink()) throw new Error(`${label}에 심볼릭 링크를 사용할 수 없습니다.`);
  const canonical = await realpath(directoryPath).catch(() => {
    throw new Error(`${label} 경로를 확인할 수 없습니다: ${directoryPath}`);
  });
  const canonicalMetadata = await stat(canonical);
  if (!canonicalMetadata.isDirectory()) throw new Error(`${label}이 폴더가 아닙니다.`);
  return canonical;
}

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
}

function relativeDisplayPath(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}

async function assertNoSymlinkTree(projectRoot: string): Promise<void> {
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`프로젝트에 심볼릭 링크를 사용할 수 없습니다: ${entry.name}`);
      if (entry.isDirectory()) await visit(fullPath);
    }
  };
  await visit(projectRoot);
}

async function collectRawSnapshot(projectRoot: string): Promise<RawSnapshot> {
  const snapshot: RawSnapshot = new Map();
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`RAW 검사 중 심볼릭 링크가 발견되었습니다: ${entry.name}`);
      if (entry.isDirectory()) {
        if (isIntegratedDirectoryName(entry.name)) continue;
        await visit(fullPath, path.posix.join(relativeDirectory, entry.name));
        continue;
      }
      if (!entry.isFile() || !RAW_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      snapshot.set(relativePath, { name: entry.name, size: metadata.size, mtimeMs: metadata.mtimeMs });
    }
  };
  await visit(projectRoot, "");
  return snapshot;
}

async function collectSourceJpgs(projectRoot: string): Promise<SourceJpg[]> {
  const files: SourceJpg[] = [];
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`JPG정리 중 심볼릭 링크가 발견되었습니다: ${entry.name}`);
      if (entry.isDirectory()) {
        if (isIntegratedDirectoryName(entry.name)) continue;
        await visit(fullPath, path.posix.join(relativeDirectory, entry.name));
        continue;
      }
      if (!entry.isFile() || !JPG_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      files.push({ source: fullPath, relativePath: path.posix.join(relativeDirectory, entry.name), name: entry.name, size: metadata.size, mtimeMs: metadata.mtimeMs });
    }
  };
  await visit(projectRoot, "");
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true, sensitivity: "base" }));
}

function sameRawSnapshot(before: RawSnapshot, after: RawSnapshot): boolean {
  if (before.size !== after.size) return false;
  for (const [relativePath, value] of before) {
    const next = after.get(relativePath);
    if (!next || next.name !== value.name || next.size !== value.size || next.mtimeMs !== value.mtimeMs) return false;
  }
  return true;
}

function conflictResult(projectPath: string, projectRoot: string, conflicts: SourceJpgConflict[], rawUntouched: number): SourceProjectPrepResult {
  return { projectPath, projectRoot, jpgMoved: 0, jpgAlreadyPrepared: 0, rawUntouched, conflicts, status: "REVIEW_REQUIRED" };
}

/** 명시적 진행 이후에만 호출하는 SSD1 JPG정리 guard. */
export async function assertSafeSourceJpgRelocation(input: {
  sourceRoot: string;
  projectRoot: string;
  source: string;
  destination: string;
}): Promise<void> {
  const { sourceRoot, projectRoot, source, destination } = input;
  for (const [value, label] of [[sourceRoot, "SOURCE_ROOT"], [projectRoot, "프로젝트"], [source, "JPG 원본"], [destination, "JPG 목적지"]] as const) {
    if (!value || value.includes("\0") || !path.isAbsolute(value)) throw new Error(`${label} 경로가 올바르지 않습니다.`);
  }
  assertWithin(sourceRoot, projectRoot, "프로젝트");
  assertWithin(projectRoot, source, "JPG 원본");
  assertWithin(projectRoot, destination, "JPG 목적지");
  const sourceSegments = path.relative(projectRoot, source).split(path.sep);
  if (sourceSegments.some((segment) => isIntegratedDirectoryName(segment))) throw new Error("JPG전체 내부 파일은 다시 통합할 수 없습니다.");
  const destinationDirectory = path.dirname(destination);
  const destinationSegments = path.relative(projectRoot, destinationDirectory).split(path.sep).filter(Boolean);
  // JPG전체 아래의 원래 상대경로를 보존한다. 하위 폴더 하나가 독립 촬영 묶음이므로
  // 파일명을 한 곳에 평면화하면 서로 다른 날/카메라 촬영이 한 결과로 섞인다.
  if (!destinationSegments.length || !isIntegratedDirectoryName(destinationSegments[0]) || !isWithin(projectRoot, destinationDirectory)) {
    throw new Error("JPG 목적지는 JPG전체 폴더 안이어야 합니다.");
  }
  if (path.basename(source) !== path.basename(destination)) throw new Error("JPG 파일명 변경은 허용하지 않습니다.");
  const fileExtension = extension(path.basename(source));
  if (RAW_PHOTO_EXTENSIONS.has(fileExtension) || !JPG_PHOTO_EXTENSIONS.has(fileExtension)) throw new Error("SSD1에서는 JPG/JPEG 파일만 JPG전체로 이동할 수 있습니다.");
  const sourceMetadata = await lstat(source).catch(() => null);
  if (!sourceMetadata?.isFile() || sourceMetadata.isSymbolicLink()) throw new Error("JPG 원본이 안전한 일반 파일이 아닙니다.");
  const destinationMetadata = await lstat(destination).catch(() => null);
  if (destinationMetadata?.isSymbolicLink()) throw new Error("JPG 목적지에 심볼릭 링크를 사용할 수 없습니다.");
  // 작업이 중간에 끊겨도 이미 옮겨진 JPG는 그대로 두고, 남은 파일만 이어서 처리한다.
  // 목적지 존재만으로 전체 작업을 실패시키면 photoJpgCopy의 안전한 skip/retry가 영영
  // 실행되지 않는다(2026-09-30).
  if (destinationMetadata && !destinationMetadata.isFile()) throw new Error("JPG 목적지가 안전한 일반 파일이 아닙니다.");
}

async function resolveIntegratedDirectory(projectRoot: string): Promise<string> {
  const matchingEntries = (await readdir(projectRoot, { withFileTypes: true }))
    .filter((entry) => isIntegratedDirectoryName(entry.name));
  if (matchingEntries.length > 1) throw new Error("정규화 형식이 다른 JPG전체 폴더가 중복되어 있습니다.");
  return path.join(projectRoot, matchingEntries[0]?.name ?? JPG_INTEGRATED_DIRECTORY);
}

async function prepareDirectory(directory: string): Promise<string> {
  const metadata = await lstat(directory).catch(() => null);
  if (metadata) {
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("JPG전체가 안전한 폴더가 아닙니다.");
    return directory;
  }
  await mkdir(directory, { recursive: true });
  return directory;
}

/** JPG전체 아래 상대경로별 파일을 읽는다. 재시작 시 같은 상대경로·같은 크기만 이어하기로 인정한다. */
async function collectIntegratedJpgs(directory: string): Promise<Map<string, SourceJpg>> {
  const files = new Map<string, SourceJpg>();
  const visit = async (current: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const relativePath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`JPG전체에 심볼릭 링크를 사용할 수 없습니다: ${relativePath}`);
      if (entry.isDirectory()) {
        await visit(fullPath, relativePath);
        continue;
      }
      if (!entry.isFile()) throw new Error(`JPG전체에 안전하지 않은 항목이 있습니다: ${relativePath}`);
      if (!JPG_PHOTO_EXTENSIONS.has(extension(entry.name))) throw new Error(`JPG전체에 JPG/JPEG가 아닌 파일이 있습니다: ${relativePath}`);
      const metadata = await stat(fullPath);
      files.set(relativePath, { source: fullPath, relativePath, name: entry.name, size: metadata.size, mtimeMs: metadata.mtimeMs });
    }
  };
  const metadata = await lstat(directory).catch(() => null);
  if (!metadata) return files;
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("JPG전체가 안전한 폴더가 아닙니다.");
  await visit(directory, "");
  return files;
}

/** 승인 후 JPG/JPEG만 같은 프로젝트의 JPG전체로 rename한다. */
export async function preparePrimaryPhotoProject(projectPath: string, options: SourceProjectPrepOptions = {}): Promise<SourceProjectPrepResult> {
  const roots = options.roots ?? getStorageRoots();
  const relativeProject = normalizeProjectPath(projectPath);
  const sourceRoot = await requireDirectory(roots.sourceRoot, "SOURCE_ROOT", true);
  const projectCandidate = path.resolve(sourceRoot, relativeProject);
  assertWithin(sourceRoot, projectCandidate, "프로젝트");
  const projectRoot = await requireDirectory(projectCandidate, "프로젝트", true);
  assertWithin(sourceRoot, projectRoot, "프로젝트");
  await assertNoSymlinkTree(projectRoot);

  const rawBefore = await collectRawSnapshot(projectRoot);
  const sourceJpgs = await collectSourceJpgs(projectRoot);
  const integratedDirectory = await resolveIntegratedDirectory(projectRoot);
  let existingDestinations: Map<string, SourceJpg>;
  try {
    existingDestinations = await collectIntegratedJpgs(integratedDirectory);
  } catch {
    return conflictResult(relativeProject.split(path.sep).join("/"), projectRoot, [{ source: integratedDirectory, destination: integratedDirectory, reason: "unsafe_destination" }], rawBefore.size);
  }

  const conflicts: SourceJpgConflict[] = [];
  let alreadyPrepared = existingDestinations.size;
  for (const file of sourceJpgs) {
    const existing = existingDestinations.get(file.relativePath);
    if (existing) {
      // 같은 파일은 이미 준비된 것으로 보고 source의 중복만 제거하지 않는다. 사람이
      // 파일을 바꿔 끼운 경우에만 검토로 올린다.
      if (existing.size !== file.size) {
        conflicts.push({ source: relativeDisplayPath(sourceRoot, file.source), destination: relativeDisplayPath(sourceRoot, path.join(integratedDirectory, ...file.relativePath.split("/"))), reason: "destination_exists" });
      }
    }
  }
  if (conflicts.length > 0) return conflictResult(relativeProject.split(path.sep).join("/"), projectRoot, conflicts, rawBefore.size);

  const pendingJpgs = sourceJpgs.filter((file) => !existingDestinations.has(file.relativePath));

  // 모든 rename 계획을 확인한 뒤에만 JPG전체를 만들거나 파일을 움직인다.
  for (const file of pendingJpgs) await assertSafeSourceJpgRelocation({ sourceRoot, projectRoot, source: file.source, destination: path.join(integratedDirectory, ...file.relativePath.split("/")) });

  if (pendingJpgs.length === 0) {
    return { projectPath: relativeProject.split(path.sep).join("/"), projectRoot, jpgMoved: 0, jpgAlreadyPrepared: alreadyPrepared, rawUntouched: rawBefore.size, conflicts: [], status: "JPG_MERGE_COMPLETED" };
  }

  const destinationDirectory = await prepareDirectory(integratedDirectory);
  const moved: Array<{ source: string; destination: string }> = [];
  try {
    options.onProgress?.({
      stage: "PREPARING",
      current: 0,
      total: pendingJpgs.length,
      message: `JPG정리 이어하기 시작: ${relativeProject}`,
    });
    for (const [index, file] of pendingJpgs.entries()) {
      const destination = path.join(destinationDirectory, ...file.relativePath.split("/"));
      await prepareDirectory(path.dirname(destination));
      await rename(file.source, destination); // SSD1은 rename만 허용, EXDEV fallback 금지
      moved.push({ source: file.source, destination });
      options.onProgress?.({
        stage: "PREPARING",
        current: index + 1,
        total: pendingJpgs.length,
        message: `JPG전체로 정리: ${file.name}`,
      });
    }
  } catch (error) {
    for (const item of moved.reverse()) await rename(item.destination, item.source).catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "EXDEV") throw new Error("SSD1 JPG정리는 동일 볼륨 rename만 허용합니다(EXDEV).");
    throw error;
  }

  const rawAfter = await collectRawSnapshot(projectRoot);
  if (!sameRawSnapshot(rawBefore, rawAfter)) throw new Error("JPG정리 후 RAW 무결성 검증에 실패했습니다.");
  const remaining = await collectSourceJpgs(projectRoot);
  const destinationAfter = await collectIntegratedJpgs(destinationDirectory);
  const destinationBytes = Array.from(destinationAfter.values()).map((entry) => entry.size);
  const sourceBytes = pendingJpgs.reduce((sum, file) => sum + file.size, 0);
  if (remaining.length !== sourceJpgs.length - pendingJpgs.length || destinationAfter.size < pendingJpgs.length || destinationBytes.reduce((sum, size) => sum + size, 0) < sourceBytes) throw new Error("JPG전체 정리 결과 검증에 실패했습니다.");

  return { projectPath: relativeProject.split(path.sep).join("/"), projectRoot, jpgMoved: pendingJpgs.length, jpgAlreadyPrepared: alreadyPrepared, rawUntouched: rawBefore.size, conflicts: [], status: "JPG_MERGE_COMPLETED" };
}

export { JPG_INTEGRATED_DIRECTORY } from "./storageLayout";
