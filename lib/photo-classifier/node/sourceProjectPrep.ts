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
import type { RunnerProgress, RunnerRoots } from "./types";

const JPG_INTEGRATED_DIRECTORY = "JPG전체";

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
      if (entry.isSymbolicLink()) throw new Error(`JPG 통합 중 심볼릭 링크가 발견되었습니다: ${entry.name}`);
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

/** 명시적 승인 이후에만 호출하는 SSD1 JPG 통합 guard. */
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
  if (path.dirname(destinationDirectory) !== projectRoot || !isIntegratedDirectoryName(path.basename(destinationDirectory))) {
    throw new Error("JPG 목적지는 JPG전체 폴더여야 합니다.");
  }
  if (path.basename(source) !== path.basename(destination)) throw new Error("JPG 파일명 변경은 허용하지 않습니다.");
  const fileExtension = extension(path.basename(source));
  if (RAW_PHOTO_EXTENSIONS.has(fileExtension) || !JPG_PHOTO_EXTENSIONS.has(fileExtension)) throw new Error("SSD1에서는 JPG/JPEG 파일만 JPG전체로 이동할 수 있습니다.");
  const sourceMetadata = await lstat(source).catch(() => null);
  if (!sourceMetadata?.isFile() || sourceMetadata.isSymbolicLink()) throw new Error("JPG 원본이 안전한 일반 파일이 아닙니다.");
  const destinationMetadata = await lstat(destination).catch(() => null);
  if (destinationMetadata?.isSymbolicLink()) throw new Error("JPG 목적지에 심볼릭 링크를 사용할 수 없습니다.");
  if (destinationMetadata) throw new Error("JPG 목적지가 이미 존재합니다. 덮어쓰지 않습니다.");
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
  await mkdir(directory);
  return directory;
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
  const existingDestinationEntries = await readdir(integratedDirectory, { withFileTypes: true }).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });
  if (existingDestinationEntries.some((entry) => entry.isSymbolicLink())) {
    return conflictResult(relativeProject.split(path.sep).join("/"), projectRoot, [{ source: integratedDirectory, destination: integratedDirectory, reason: "unsafe_destination" }], rawBefore.size);
  }

  const conflicts: SourceJpgConflict[] = [];
  const destinationNames = new Set(existingDestinationEntries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const plannedNames = new Set<string>();
  for (const file of sourceJpgs) {
    if (plannedNames.has(file.name)) conflicts.push({ source: relativeDisplayPath(sourceRoot, file.source), destination: relativeDisplayPath(sourceRoot, path.join(integratedDirectory, file.name)), reason: "duplicate_filename" });
    plannedNames.add(file.name);
    if (destinationNames.has(file.name)) conflicts.push({ source: relativeDisplayPath(sourceRoot, file.source), destination: relativeDisplayPath(sourceRoot, path.join(integratedDirectory, file.name)), reason: "destination_exists" });
  }
  if (conflicts.length > 0) return conflictResult(relativeProject.split(path.sep).join("/"), projectRoot, conflicts, rawBefore.size);

  // 모든 rename 계획을 확인한 뒤에만 JPG전체를 만들거나 파일을 움직인다.
  for (const file of sourceJpgs) await assertSafeSourceJpgRelocation({ sourceRoot, projectRoot, source: file.source, destination: path.join(integratedDirectory, file.name) });

  if (sourceJpgs.length === 0) {
    return { projectPath: relativeProject.split(path.sep).join("/"), projectRoot, jpgMoved: 0, jpgAlreadyPrepared: destinationNames.size, rawUntouched: rawBefore.size, conflicts: [], status: "JPG_MERGE_COMPLETED" };
  }

  const destinationDirectory = await prepareDirectory(integratedDirectory);
  const moved: Array<{ source: string; destination: string }> = [];
  try {
    options.onProgress?.({
      stage: "PREPARING",
      current: 0,
      total: sourceJpgs.length,
      message: `JPG 통합 시작: ${relativeProject}`,
    });
    for (const [index, file] of sourceJpgs.entries()) {
      const destination = path.join(destinationDirectory, file.name);
      await rename(file.source, destination); // SSD1은 rename만 허용, EXDEV fallback 금지
      moved.push({ source: file.source, destination });
      options.onProgress?.({
        stage: "PREPARING",
        current: index + 1,
        total: sourceJpgs.length,
        message: `JPG전체로 이동: ${file.name}`,
      });
    }
  } catch (error) {
    for (const item of moved.reverse()) await rename(item.destination, item.source).catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "EXDEV") throw new Error("SSD1 JPG 통합은 동일 볼륨 rename만 허용합니다(EXDEV).");
    throw error;
  }

  const rawAfter = await collectRawSnapshot(projectRoot);
  if (!sameRawSnapshot(rawBefore, rawAfter)) throw new Error("JPG 통합 후 RAW 무결성 검증에 실패했습니다.");
  const remaining = await collectSourceJpgs(projectRoot);
  const destinationAfter = (await readdir(destinationDirectory, { withFileTypes: true })).filter((entry) => entry.isFile() && JPG_PHOTO_EXTENSIONS.has(extension(entry.name)));
  const destinationBytes = await Promise.all(destinationAfter.map(async (entry) => (await stat(path.join(destinationDirectory, entry.name))).size));
  const sourceBytes = sourceJpgs.reduce((sum, file) => sum + file.size, 0);
  if (remaining.length !== 0 || destinationAfter.length < sourceJpgs.length || destinationBytes.reduce((sum, size) => sum + size, 0) < sourceBytes) throw new Error("JPG전체 통합 결과 검증에 실패했습니다.");

  return { projectPath: relativeProject.split(path.sep).join("/"), projectRoot, jpgMoved: sourceJpgs.length, jpgAlreadyPrepared: destinationNames.size, rawUntouched: rawBefore.size, conflicts: [], status: "JPG_MERGE_COMPLETED" };
}

export { JPG_INTEGRATED_DIRECTORY };
