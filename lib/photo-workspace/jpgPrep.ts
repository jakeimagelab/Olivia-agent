import { moveFileFast } from "@/lib/photo-classifier/file-move";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import { CAMERA_JPG_EXTENSIONS, isHiddenSystemFile, RAW_PHOTO_EXTENSIONS } from "@/lib/photo/extensions";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";

export type JpgPrepPlanStatus = "move" | "moved" | "skip" | "conflict";

type SourceJpg = {
  fileHandle: FileSystemFileHandle;
  sourceDirectory: FileSystemDirectoryHandle;
  name: string;
  size: number;
  lastModified: number;
  relativeDirectory: string[];
};

export type JpgPrepPlanRow = SourceJpg & {
  destinationDirectory: string[];
  destinationPath: string;
  status: JpgPrepPlanStatus;
  reason: string;
};

export type JpgPrepPlan = {
  rows: JpgPrepPlanRow[];
  rawUntouched: number;
  hiddenExcluded: number;
};

export type JpgPrepStats = { moved: number; skipped: number; rawUntouched: number; conflicts: number };

type DestinationEntry =
  | { kind: "file"; file: File }
  | { kind: "directory" };
type SourceJpgCandidate = Omit<SourceJpg, "size" | "lastModified">;

const EMPTY_STATS: JpgPrepStats = { moved: 0, skipped: 0, rawUntouched: 0, conflicts: 0 };
const MAX_DEPTH = 5;
const FILE_METADATA_CONCURRENCY = 16;

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const next = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

function destinationKey(segments: readonly string[]): string {
  return segments.join("/").normalize("NFC").toLocaleLowerCase("en-US");
}

async function directoryIfPresent(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
): Promise<FileSystemDirectoryHandle | null> {
  let current = root;
  for (const segment of segments) {
    try {
      current = await current.getDirectoryHandle(segment);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
  return current;
}

async function directoryForWrite(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) current = await current.getDirectoryHandle(segment, { create: true });
  return current;
}

async function existingDestination(
  root: FileSystemDirectoryHandle,
  directory: readonly string[],
  fileName: string,
): Promise<File | "directory" | null> {
  const parent = await directoryIfPresent(root, [JPG_INTEGRATED_DIRECTORY, ...directory]);
  if (!parent) return null;
  try {
    return await (await parent.getFileHandle(fileName)).getFile();
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    await parent.getDirectoryHandle(fileName);
    return "directory";
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function isJpgIntegratedRoot(name: string): boolean {
  return name.normalize("NFC") === JPG_INTEGRATED_DIRECTORY.normalize("NFC");
}

async function collectSources(root: FileSystemDirectoryHandle, includeSubdirectories: boolean) {
  const candidates: SourceJpgCandidate[] = [];
  let rawUntouched = 0;
  let hiddenExcluded = 0;
  const visit = async (directory: FileSystemDirectoryHandle, relativeDirectory: string[], depth: number): Promise<void> => {
    for await (const [name, handle] of (directory as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
      if (handle.kind === "directory") {
        if (isHiddenSystemFile(name) || isJpgIntegratedRoot(name) || isDeliveredRoundFolder(name)) continue;
        if (includeSubdirectories && depth < MAX_DEPTH) await visit(handle as FileSystemDirectoryHandle, [...relativeDirectory, name], depth + 1);
        continue;
      }
      if (isHiddenSystemFile(name)) {
        hiddenExcluded += 1;
        continue;
      }
      const fileExtension = extension(name);
      if (RAW_PHOTO_EXTENSIONS.has(fileExtension)) {
        rawUntouched += 1;
        continue;
      }
      if (!CAMERA_JPG_EXTENSIONS.has(fileExtension)) continue;
      candidates.push({ fileHandle: handle as FileSystemFileHandle, sourceDirectory: directory, name, relativeDirectory });
    }
  };
  await visit(root, [], 0);
  const jpgs = await mapConcurrent(candidates, FILE_METADATA_CONCURRENCY, async (candidate) => {
    const file = await candidate.fileHandle.getFile();
    return { ...candidate, size: file.size, lastModified: file.lastModified };
  });
  return { jpgs, rawUntouched, hiddenExcluded };
}

async function collectDestinationIndex(root: FileSystemDirectoryHandle): Promise<Map<string, DestinationEntry>> {
  const index = new Map<string, DestinationEntry>();
  const integrated = await directoryIfPresent(root, [JPG_INTEGRATED_DIRECTORY]);
  if (!integrated) return index;
  const files: Array<{ key: string; handle: FileSystemFileHandle }> = [];
  const visit = async (directory: FileSystemDirectoryHandle, relativeDirectory: string[], depth: number): Promise<void> => {
    for await (const [name, handle] of (directory as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
      const relativePath = [...relativeDirectory, name];
      const key = destinationKey(relativePath);
      if (handle.kind === "directory") {
        if (isDeliveredRoundFolder(name)) continue;
        index.set(key, { kind: "directory" });
        if (depth < MAX_DEPTH) await visit(handle as FileSystemDirectoryHandle, relativePath, depth + 1);
      } else {
        files.push({ key, handle: handle as FileSystemFileHandle });
      }
    }
  };
  await visit(integrated, [], 0);
  const metadata = await mapConcurrent(files, FILE_METADATA_CONCURRENCY, async ({ key, handle }) => ({ key, file: await handle.getFile() }));
  for (const entry of metadata) index.set(entry.key, { kind: "file", file: entry.file });
  return index;
}

function destinationParentConflict(index: ReadonlyMap<string, DestinationEntry>, segments: readonly string[]): boolean {
  for (let length = 1; length <= segments.length; length += 1) {
    if (index.get(destinationKey(segments.slice(0, length)))?.kind === "file") return true;
  }
  return false;
}

export async function buildJpgPrepPlan(
  root: FileSystemDirectoryHandle,
  options: { includeSubdirectories: boolean; preserveStructure: boolean },
): Promise<JpgPrepPlan> {
  const [{ jpgs, rawUntouched, hiddenExcluded }, destinationIndex] = await Promise.all([
    collectSources(root, options.includeSubdirectories),
    collectDestinationIndex(root),
  ]);
  const plannedDestination = new Map<string, SourceJpg>();
  const rows: JpgPrepPlanRow[] = [];
  for (const jpg of jpgs) {
    const destinationDirectory = options.preserveStructure ? jpg.relativeDirectory : [];
    const destinationPath = [JPG_INTEGRATED_DIRECTORY, ...destinationDirectory, jpg.name].join("/");
    const key = destinationKey([...destinationDirectory, jpg.name]);
    const duplicatePlan = plannedDestination.get(key);
    if (duplicatePlan) {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "conflict", reason: `다른 원본과 목적지 이름이 같습니다: ${duplicatePlan.name}` });
      continue;
    }
    plannedDestination.set(key, jpg);
    if (destinationParentConflict(destinationIndex, destinationDirectory)) {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "conflict", reason: "목적지 상위 경로에 같은 이름의 파일이 있습니다." });
      continue;
    }
    const existing = destinationIndex.get(key);
    if (existing?.kind === "directory") {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "conflict", reason: "같은 이름의 폴더가 있습니다." });
    } else if (existing?.kind === "file") {
      const identical = existing.file.size === jpg.size && existing.file.lastModified === jpg.lastModified;
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: identical ? "skip" : "conflict", reason: identical ? "이미 같은 파일이 있습니다." : "같은 이름이지만 크기 또는 수정시각이 다릅니다." });
    } else {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "move", reason: "JPG전체로 옮깁니다." });
    }
  }
  rows.sort((left, right) => left.destinationPath.localeCompare(right.destinationPath, "ko", { numeric: true, sensitivity: "base" }));
  return { rows, rawUntouched, hiddenExcluded };
}

export function jpgPrepStats(plan: JpgPrepPlan | null): JpgPrepStats {
  if (!plan) return EMPTY_STATS;
  return {
    moved: plan.rows.filter((row) => row.status === "move" || row.status === "moved").length,
    skipped: plan.rows.filter((row) => row.status === "skip").length,
    rawUntouched: plan.rawUntouched,
    conflicts: plan.rows.filter((row) => row.status === "conflict").length,
  };
}

export async function movePlannedJpg(root: FileSystemDirectoryHandle, row: JpgPrepPlanRow): Promise<void> {
  const lateDestination = await existingDestination(root, row.destinationDirectory, row.name);
  if (lateDestination) throw new Error(`${row.destinationPath}에 파일이 새로 생겨 덮어쓰지 않았습니다.`);
  const destinationDirectory = await directoryForWrite(root, [JPG_INTEGRATED_DIRECTORY, ...row.destinationDirectory]);
  const result = await moveFileFast({ src: row.fileHandle, destDir: destinationDirectory, fileName: row.name });
  if (result.method === "native-move") return;
  const copied = await (await destinationDirectory.getFileHandle(row.name)).getFile();
  if (copied.size !== row.size) {
    await destinationDirectory.removeEntry(row.name).catch(() => undefined);
    throw new Error(`${row.name} 복사 검증에 실패했습니다.`);
  }
  try {
    await row.sourceDirectory.removeEntry(row.name);
  } catch (error) {
    await destinationDirectory.removeEntry(row.name).catch(() => undefined);
    throw error;
  }
}
