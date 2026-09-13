import { constants as fsConstants } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  realpath,
  readdir,
  stat,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import type {
  PreparedWorkFolder,
  RunnerProgress,
  RunnerRoots,
} from "./types";

export const REMOTE_PHOTO_SOURCE_ROOT = "/Volumes/Workstation(M.2SSD)";
export const REMOTE_PHOTO_WORK_ROOT = "/Users/jakemacstudio/Desktop/Olivia_Work_Test";

export const DEFAULT_REMOTE_PHOTO_ROOTS: RunnerRoots = {
  sourceRoot: REMOTE_PHOTO_SOURCE_ROOT,
  workRoot: REMOTE_PHOTO_WORK_ROOT,
};

const OUTPUT_DIRECTORIES = ["RAW", "JPG", "SELECT", "REPORT", "PROFILE"] as const;

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function assertWithin(root: string, candidate: string, label: string): void {
  if (!isWithin(root, candidate)) {
    throw new Error(`${label} 경로가 허용된 Root 밖을 가리킵니다.`);
  }
}

export function normalizeSourceFolder(sourceFolder: string): string {
  if (typeof sourceFolder !== "string") throw new Error("source_folder가 필요합니다.");
  if (sourceFolder.includes("\0")) throw new Error("source_folder에 허용되지 않는 문자가 있습니다.");
  if (path.isAbsolute(sourceFolder) || sourceFolder.startsWith("/") || sourceFolder.includes("\\")) {
    throw new Error("source_folder는 NAS Root 기준 상대경로여야 합니다.");
  }

  const rawSegments = sourceFolder.split("/");
  if (!sourceFolder || rawSegments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("NAS Root가 아닌 촬영 폴더를 지정해주세요.");
  }
  return rawSegments.join(path.sep);
}

async function requireDirectory(directoryPath: string, label: string): Promise<string> {
  const canonical = await realpath(directoryPath).catch(() => {
    throw new Error(`${label}을 찾을 수 없습니다: ${directoryPath}`);
  });
  const metadata = await stat(canonical);
  if (!metadata.isDirectory()) throw new Error(`${label}이 폴더가 아닙니다.`);
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

type TreeSummary = { files: number; bytes: number };

async function inspectSafeTree(root: string): Promise<TreeSummary> {
  const summary: TreeSummary = { files: 0, bytes: 0 };
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`심볼릭 링크는 안전한 복사 대상이 아닙니다: ${entry.name}`);
      }
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`일반 파일이 아닌 항목은 처리할 수 없습니다: ${entry.name}`);
      }
      const metadata = await stat(fullPath);
      summary.files += 1;
      summary.bytes += metadata.size;
    }
  };
  await visit(root);
  return summary;
}

async function ensureSafeDestinationParent(workRoot: string, destination: string): Promise<void> {
  assertWithin(workRoot, destination, "작업 목적지");
  const relativeParent = path.relative(workRoot, path.dirname(destination));
  let cursor = workRoot;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (await pathExists(cursor)) {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`작업 경로의 상위 항목이 안전한 폴더가 아닙니다: ${cursor}`);
      }
    } else {
      await mkdir(cursor);
    }
    const canonical = await realpath(cursor);
    assertWithin(workRoot, canonical, "작업 경로");
  }
}

async function copyTreeExclusive(
  source: string,
  destination: string,
  onCopied?: (summary: TreeSummary, fileName: string) => void,
): Promise<TreeSummary> {
  await mkdir(destination, { recursive: false });
  const summary: TreeSummary = { files: 0, bytes: 0 };

  const copyDirectory = async (sourceDirectory: string, destinationDirectory: string): Promise<void> => {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`심볼릭 링크는 복사하지 않습니다: ${entry.name}`);
      }
      if (entry.isDirectory()) {
        await mkdir(destinationPath, { recursive: false });
        await copyDirectory(sourcePath, destinationPath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`일반 파일이 아닌 항목은 복사하지 않습니다: ${entry.name}`);
      }
      await copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL);
      const [sourceMetadata, destinationMetadata] = await Promise.all([
        stat(sourcePath),
        stat(destinationPath),
      ]);
      if (sourceMetadata.size !== destinationMetadata.size) {
        throw new Error(`${entry.name} 복사 크기 검증에 실패했습니다.`);
      }
      await utimes(destinationPath, sourceMetadata.atime, sourceMetadata.mtime);
      summary.files += 1;
      summary.bytes += sourceMetadata.size;
      onCopied?.(summary, entry.name);
    }
  };

  await copyDirectory(source, destination);
  return summary;
}

export async function assertUnprocessedWorkFolder(workFolder: string): Promise<void> {
  for (const directory of OUTPUT_DIRECTORIES) {
    if (await pathExists(path.join(workFolder, directory))) {
      throw new Error(`${directory} 폴더가 이미 존재합니다. 기존 작업 폴더에는 덮어쓰지 않습니다.`);
    }
  }
}

export async function prepareRemotePhotoWorkFolder(
  input: { sourceFolder?: string; workFolder?: string },
  roots: RunnerRoots = DEFAULT_REMOTE_PHOTO_ROOTS,
  onProgress?: (progress: RunnerProgress) => void,
): Promise<PreparedWorkFolder> {
  if (Boolean(input.sourceFolder) === Boolean(input.workFolder)) {
    throw new Error("--source-folder 또는 --work-folder 중 하나만 지정해야 합니다.");
  }

  if (input.workFolder) {
    const workRoot = await requireDirectory(roots.workRoot, "WORK_ROOT");
    const workFolder = await requireDirectory(input.workFolder, "작업 폴더");
    assertWithin(workRoot, workFolder, "작업 폴더");
    await inspectSafeTree(workFolder);
    await assertUnprocessedWorkFolder(workFolder);
    return {
      sourceFolder: path.relative(workRoot, workFolder).split(path.sep).join("/"),
      workFolder,
      staged: false,
    };
  }

  const relativeSource = normalizeSourceFolder(input.sourceFolder ?? "");
  const sourceRoot = await requireDirectory(roots.sourceRoot, "SOURCE_ROOT");
  const source = await requireDirectory(path.resolve(sourceRoot, relativeSource), "NAS 원본 폴더");
  assertWithin(sourceRoot, source, "NAS 원본 폴더");

  await mkdir(roots.workRoot, { recursive: true });
  const workRoot = await requireDirectory(roots.workRoot, "WORK_ROOT");
  const destination = path.resolve(workRoot, relativeSource);
  assertWithin(workRoot, destination, "작업 목적지");
  if (await pathExists(destination)) {
    throw new Error(`작업 목적지가 이미 존재합니다. 덮어쓰지 않습니다: ${destination}`);
  }

  onProgress?.({ stage: "STAGING", message: "NAS 원본을 안전한 작업 폴더로 복사하기 전 검사 중입니다." });
  const sourceSummary = await inspectSafeTree(source);
  await ensureSafeDestinationParent(workRoot, destination);
  onProgress?.({ stage: "STAGING", current: 0, total: sourceSummary.files, message: "NAS 원본을 WORK_ROOT로 복사 중입니다." });
  const copiedSummary = await copyTreeExclusive(source, destination, (summary, fileName) => {
    onProgress?.({
      stage: "STAGING",
      current: summary.files,
      total: sourceSummary.files,
      message: `NAS 원본 복사: ${fileName}`,
    });
  });
  if (copiedSummary.files !== sourceSummary.files || copiedSummary.bytes !== sourceSummary.bytes) {
    throw new Error("NAS 작업 폴더 복사 검증에 실패했습니다.");
  }
  await assertUnprocessedWorkFolder(destination);

  return {
    sourceFolder: relativeSource.split(path.sep).join("/"),
    workFolder: destination,
    staged: true,
  };
}

export async function resolveSafeWorkRoot(roots: RunnerRoots = DEFAULT_REMOTE_PHOTO_ROOTS): Promise<string> {
  return requireDirectory(roots.workRoot, "WORK_ROOT");
}

export async function assertSafeWorkMutation(
  target: string,
  roots: RunnerRoots = DEFAULT_REMOTE_PHOTO_ROOTS,
): Promise<void> {
  const workRoot = await resolveSafeWorkRoot(roots);
  const parent = await realpath(path.dirname(target)).catch(() => path.dirname(target));
  assertWithin(workRoot, parent, "파일 작업");
  assertWithin(workRoot, path.resolve(target), "파일 작업");
}
