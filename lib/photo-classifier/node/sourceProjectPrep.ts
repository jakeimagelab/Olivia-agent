import { constants as fsConstants } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import { getStorageRoots } from "./storageConfig";
import type { RunnerRoots } from "./types";
import { JPG_PHOTO_EXTENSIONS, RAW_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";

export type SourceJpgConflict = {
  source: string;
  destination: string;
  reason: "destination_exists" | "unsafe_destination";
};

export type SourceProjectPrepResult = {
  projectPath: string;
  projectRoot: string;
  jpgMoved: number;
  jpgAlreadyPrepared: number;
  rawUntouched: number;
  conflicts: SourceJpgConflict[];
  status: "READY" | "REVIEW_REQUIRED";
};

type SourceProjectPrepOptions = {
  roots?: RunnerRoots;
  onProgress?: (message: string) => void;
};

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

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function assertNoSymlinkPath(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const metadata = await lstat(cursor).catch(() => null);
    if (metadata?.isSymbolicLink()) throw new Error(`프로젝트 경로에 심볼릭 링크를 사용할 수 없습니다: ${cursor}`);
  }
}

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
}

function relativeDisplayPath(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}

/**
 * SSD1에서 허용하는 유일한 파일 이동을 사전에 검증한다.
 * 이 함수는 RAW, 다른 프로젝트, 다른 파일명, Scene 폴더로의 이동을 모두 거부한다.
 */
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

  if (path.dirname(source) !== projectRoot) throw new Error("JPG 원본은 프로젝트 바로 아래 파일이어야 합니다.");
  if (path.dirname(destination) !== path.join(projectRoot, "JPG원본")) throw new Error("JPG 목적지는 JPG원본 폴더여야 합니다.");
  if (path.basename(source) !== path.basename(destination)) throw new Error("JPG 파일명 변경은 허용하지 않습니다.");

  const fileExtension = extension(path.basename(source));
  if (RAW_PHOTO_EXTENSIONS.has(fileExtension) || !JPG_PHOTO_EXTENSIONS.has(fileExtension)) {
    throw new Error("SSD1에서는 JPG/JPEG 파일만 JPG원본으로 이동할 수 있습니다.");
  }

  const sourceMetadata = await lstat(source).catch(() => null);
  if (!sourceMetadata?.isFile() || sourceMetadata.isSymbolicLink()) throw new Error("JPG 원본이 안전한 일반 파일이 아닙니다.");

  const destinationMetadata = await lstat(destination).catch(() => null);
  if (destinationMetadata?.isSymbolicLink()) throw new Error("JPG 목적지에 심볼릭 링크를 사용할 수 없습니다.");
  if (destinationMetadata) throw new Error("JPG 목적지가 이미 존재합니다. 덮어쓰지 않습니다.");
}

async function moveJpgSafely(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
    return;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code !== "EXDEV") throw error;
  }

  // 서로 다른 볼륨을 주입한 테스트 환경에서만 실행될 수 있는 검증된 fallback.
  // COPYFILE_EXCL과 크기 검증 후에도 source는 JPG일 때만 unlink한다.
  const sourceMetadata = await stat(source);
  await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
  const destinationMetadata = await stat(destination);
  if (!destinationMetadata.isFile() || destinationMetadata.size !== sourceMetadata.size) {
    throw new Error("JPG fallback 복사 크기 검증에 실패했습니다.");
  }
  await utimes(destination, sourceMetadata.atime, sourceMetadata.mtime);
  await unlink(source);
}

export async function preparePrimaryPhotoProject(
  projectPath: string,
  options: SourceProjectPrepOptions = {},
): Promise<SourceProjectPrepResult> {
  const roots = options.roots ?? getStorageRoots();
  const relativeProject = normalizeProjectPath(projectPath);
  const sourceRoot = await requireDirectory(roots.sourceRoot, "SOURCE_ROOT");
  const projectCandidate = path.resolve(sourceRoot, relativeProject);
  assertWithin(sourceRoot, projectCandidate, "프로젝트");
  await assertNoSymlinkPath(sourceRoot, projectCandidate);
  const projectRoot = await requireDirectory(projectCandidate, "프로젝트", true);
  assertWithin(sourceRoot, projectRoot, "프로젝트");

  const jpgDirectory = path.join(projectRoot, "JPG원본");
  if (await pathExists(jpgDirectory)) {
    const metadata = await lstat(jpgDirectory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("JPG원본이 안전한 폴더가 아닙니다.");
  } else {
    await mkdir(jpgDirectory);
  }

  const entries = await readdir(projectRoot, { withFileTypes: true });
  const sourceJpgs = entries.filter((entry) => entry.isFile() && JPG_PHOTO_EXTENSIONS.has(extension(entry.name)));
  const sourceRawNames = entries.filter((entry) => entry.isFile() && RAW_PHOTO_EXTENSIONS.has(extension(entry.name))).map((entry) => entry.name);
  const rawBefore = new Map<string, { size: number; mtimeMs: number }>();
  for (const name of sourceRawNames) {
    const metadata = await stat(path.join(projectRoot, name));
    rawBefore.set(name, { size: metadata.size, mtimeMs: metadata.mtimeMs });
  }

  const preparedEntries = await readdir(jpgDirectory, { withFileTypes: true });
  const preparedJpgNames = new Set(preparedEntries.filter((entry) => entry.isFile() && JPG_PHOTO_EXTENSIONS.has(extension(entry.name))).map((entry) => entry.name));
  const sourceJpgNames = new Set(sourceJpgs.map((entry) => entry.name));
  const conflicts: SourceJpgConflict[] = [];
  const movedDestinations: Array<{ source: string; destination: string; size: number }> = [];
  let jpgMoved = 0;

  options.onProgress?.(`SSD1 프로젝트 확인: ${relativeProject}`);
  for (const entry of sourceJpgs) {
    const source = path.join(projectRoot, entry.name);
    const destination = path.join(jpgDirectory, entry.name);
    if (await pathExists(destination)) {
      conflicts.push({ source: relativeDisplayPath(sourceRoot, source), destination: relativeDisplayPath(sourceRoot, destination), reason: "destination_exists" });
      continue;
    }
    await assertSafeSourceJpgRelocation({ sourceRoot, projectRoot, source, destination });
    const sourceMetadata = await stat(source);
    await moveJpgSafely(source, destination);
    movedDestinations.push({ source, destination, size: sourceMetadata.size });
    jpgMoved += 1;
    options.onProgress?.(`JPG원본으로 이동: ${entry.name}`);
  }

  for (const moved of movedDestinations) {
    const destinationMetadata = await stat(moved.destination);
    if (!destinationMetadata.isFile() || destinationMetadata.size !== moved.size || await pathExists(moved.source)) {
      throw new Error(`JPG 이동 결과 검증에 실패했습니다: ${path.basename(moved.destination)}`);
    }
  }

  for (const [name, before] of rawBefore) {
    const after = await stat(path.join(projectRoot, name));
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error(`RAW 보호 검증에 실패했습니다: ${name}`);
    }
  }

  const jpgAlreadyPrepared = [...preparedJpgNames].filter((name) => !sourceJpgNames.has(name)).length;
  return {
    projectPath: relativeProject.split(path.sep).join("/"),
    projectRoot,
    jpgMoved,
    jpgAlreadyPrepared,
    rawUntouched: rawBefore.size,
    conflicts,
    status: conflicts.length ? "REVIEW_REQUIRED" : "READY",
  };
}
