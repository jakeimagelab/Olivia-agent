import type { Dirent } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { fileSystemEntryExists } from "@/lib/selectMatch/node/preservedFileOperation";
import { parseCaptureTime } from "@/lib/selectMatch/captureTime";
import type { RemoteRawMatchRootLocator } from "@/lib/selectMatch/remoteRawMatchTypes";

const RAW_HEADER_BYTES = 4 * 1024 * 1024;
const WORKER_ROOT_SEARCH_DEPTH = 4;
const WORKER_ROOT_SEARCH_LIMIT = 50_000;

function isInside(root: string, candidate: string): boolean {
  // macOS/SMB에서 동일한 한글 경로가 directory entry에서는 NFD,
  // realpath 결과에서는 NFC로 돌아올 수 있다. 비교만 NFC로 통일한다.
  const relative = path.relative(path.resolve(root).normalize("NFC"), path.resolve(candidate).normalize("NFC"));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function safeRelativePath(value: string, label: string): string {
  if (!value || value.includes("\0") || path.isAbsolute(value)) throw new Error(`${label}은 안전한 상대경로여야 합니다.`);
  const segments = value.split(/[\\/]+/u).filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${label}이 올바르지 않습니다.`);
  }
  return segments.join(path.sep);
}

export async function existingAllowedRoots(env: NodeJS.ProcessEnv): Promise<string[]> {
  const candidates = [
    env.SOURCE_ROOT,
    env.OLIVIA_PHOTO_SOURCE_ROOT,
    env.OLIVIA_PHOTO_WORK_ROOT,
    process.platform === "darwin" ? "/Volumes" : undefined,
  ].flatMap((value) => typeof value === "string" && value.trim() ? [path.resolve(value.trim())] : []);
  const roots: string[] = [];
  for (const candidate of new Set(candidates)) {
    try {
      const canonical = await realpath(candidate);
      const metadata = await lstat(canonical);
      if (metadata.isDirectory() && !metadata.isSymbolicLink()) roots.push(canonical);
    } catch {
      // 연결되지 않은 루트는 실행 허용 목록에 넣지 않는다.
    }
  }
  return roots;
}

async function resolveRoot(input: string, allowedRoots: readonly string[], label: string): Promise<string> {
  if (!input || input.includes("\0") || !path.isAbsolute(input)) throw new Error(`${label}은 Mac Studio의 절대경로여야 합니다.`);
  const canonical = await realpath(path.resolve(input)).catch(() => {
    throw new Error(`${label}을 Mac Studio에서 찾지 못했습니다: ${input}`);
  });
  if (!allowedRoots.some((root) => isInside(root, canonical))) throw new Error(`${label}이 허용된 사진 저장소 밖입니다.`);
  const metadata = await lstat(canonical);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`${label}이 안전한 폴더가 아닙니다.`);
  return canonical;
}

export async function resolveSourceFile(root: string, relativePath: string, label: string): Promise<string> {
  const candidate = path.resolve(root, safeRelativePath(relativePath, label));
  if (!isInside(root, candidate)) throw new Error(`${label}이 기준 폴더 밖입니다.`);
  const canonical = await realpath(candidate).catch(() => {
    throw new Error(`${label}을 찾지 못했습니다: ${relativePath}`);
  });
  if (!isInside(root, canonical)) throw new Error(`${label}이 기준 폴더 밖을 가리킵니다.`);
  const metadata = await lstat(canonical);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`${label}이 안전한 파일이 아닙니다.`);
  return canonical;
}

export async function resolveDestinationDirectory(root: string, relativePath: string, label: string): Promise<string> {
  const candidate = path.resolve(root, safeRelativePath(relativePath, label));
  if (!isInside(root, candidate)) throw new Error(`${label}이 기준 폴더 밖입니다.`);
  await mkdir(candidate, { recursive: true });
  const canonical = await realpath(candidate);
  if (!isInside(root, canonical)) throw new Error(`${label}이 기준 폴더 밖을 가리킵니다.`);
  const metadata = await lstat(canonical);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`${label}이 안전한 폴더가 아닙니다.`);
  return canonical;
}

export async function resolveExistingDestinationDirectory(
  root: string,
  relativePath: string,
  label: string,
): Promise<string | null> {
  const candidate = path.resolve(root, safeRelativePath(relativePath, label));
  if (!isInside(root, candidate)) throw new Error(`${label}이 기준 폴더 밖입니다.`);
  if (!await fileSystemEntryExists(candidate)) return null;
  const canonical = await realpath(candidate);
  if (!isInside(root, canonical)) throw new Error(`${label}이 기준 폴더 밖을 가리킵니다.`);
  const metadata = await lstat(canonical);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`${label}이 안전한 폴더가 아닙니다.`);
  return canonical;
}

async function readCaptureTimeMs(filePath: string): Promise<number | null> {
  const handle = await open(filePath, "r");
  try {
    const metadata = await handle.stat();
    const length = Math.min(RAW_HEADER_BYTES, metadata.size);
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const sliced = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead);
    return parseCaptureTime(sliced)?.timestampMs ?? null;
  } finally {
    await handle.close();
  }
}

export async function assertRawIdentity(
  filePath: string,
  expectedSize: number,
  expectedCaptureTimeMs: number | null,
): Promise<void> {
  const metadata = await stat(filePath);
  if (metadata.size !== expectedSize) throw new Error(`표본 파일 크기가 다릅니다 (${metadata.size}/${expectedSize})`);
  if (expectedCaptureTimeMs !== null) {
    const actual = await readCaptureTimeMs(filePath);
    if (actual === null || Math.abs(actual - expectedCaptureTimeMs) > 2_000) {
      throw new Error("표본 파일 촬영시각이 다릅니다.");
    }
  }
}

export type RootIdentitySample = {
  relativePath: string;
  alternativeRelativePaths?: string[];
  expectedSize: number;
  expectedCaptureTimeMs: number | null;
};

export async function sampleMatches(root: string, sample: RootIdentitySample): Promise<boolean> {
  for (const relativePath of [sample.relativePath, ...(sample.alternativeRelativePaths ?? [])]) {
    try {
      const source = await resolveSourceFile(root, relativePath, "표본 파일");
      await assertRawIdentity(source, sample.expectedSize, sample.expectedCaptureTimeMs);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("기준 폴더 밖")) throw error;
    }
  }
  return false;
}

async function searchMatchingRoots(
  allowedRoots: readonly string[],
  requestedPath: string,
  samples: readonly RootIdentitySample[],
): Promise<string[]> {
  const requestedName = path.basename(requestedPath).normalize("NFC");
  const found: string[] = [];
  const queue = allowedRoots.map((root) => ({ directory: root, depth: 0 }));
  let visited = 0;
  while (queue.length && visited < 50_000) {
    const current = queue.shift()!;
    visited += 1;
    if (path.basename(current.directory).normalize("NFC") === requestedName) {
      const matches = await Promise.all(samples.slice(0, 2).map((sample) => sampleMatches(current.directory, sample)));
      if (matches.every(Boolean)) found.push(current.directory);
    }
    if (current.depth >= 6) continue;
    let entries: Dirent[];
    try {
      entries = await readdir(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
    }
  }
  return found;
}

function normalizedFolderIdentity(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("en-US").replace(/-\d+$/u, "");
}

function normalizedPathParts(value: string): string[] {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => normalizedFolderIdentity(part))
    .filter(Boolean);
}

function pathMatchesHint(candidate: string, relativePath?: string): boolean {
  if (!relativePath?.trim()) return false;
  const candidateParts = normalizedPathParts(candidate);
  const hintParts = normalizedPathParts(relativePath);
  if (!hintParts.length || hintParts.length > candidateParts.length) return false;
  return hintParts.every((part, index) => part === candidateParts[candidateParts.length - hintParts.length + index]);
}

type WorkerRootCache = Record<string, string>;

function workerRootCacheKey(locator: RemoteRawMatchRootLocator): string {
  return `${locator.projectKey.normalize("NFC")}::${locator.kind}::${normalizedFolderIdentity(locator.folderName)}`;
}

async function readWorkerRootCache(cacheFilePath?: string): Promise<WorkerRootCache> {
  if (!cacheFilePath) return {};
  try {
    const parsed: unknown = JSON.parse(await readFile(cacheFilePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

async function writeWorkerRootCache(cacheFilePath: string | undefined, cache: WorkerRootCache): Promise<void> {
  if (!cacheFilePath) return;
  await mkdir(path.dirname(cacheFilePath), { recursive: true });
  const temporaryPath = `${cacheFilePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(cache, null, 2), "utf8");
  await rename(temporaryPath, cacheFilePath);
}

async function candidateMatchesSamples(candidate: string, samples: readonly RootIdentitySample[]): Promise<boolean> {
  if (!samples.length) return false;
  const matches = await Promise.all(samples.slice(0, 2).map((sample) => sampleMatches(candidate, sample)));
  return matches.length > 0 && matches.every(Boolean);
}

async function workerRootSearchQueue(allowedRoots: readonly string[]): Promise<Array<{ directory: string; depth: number }>> {
  const queue: Array<{ directory: string; depth: number }> = [];
  for (const root of allowedRoots) {
    if (path.basename(root) !== "Volumes") {
      queue.push({ directory: root, depth: 0 });
      continue;
    }
    try {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
        // "/Volumes/* 아래 4단계"로 깊이를 계산하기 위해 각 마운트를 0단계로 시작한다.
        queue.push({ directory: path.join(root, entry.name), depth: 0 });
      }
    } catch {
      // 마운트 목록을 읽지 못한 루트는 검색 후보에서 제외한다.
    }
  }
  return queue;
}

/**
 * 브라우저가 넘긴 폴더 이름과 파일 표본만으로 Mac Studio의 실제 마운트 경로를 찾는다.
 * 절대경로 추측은 하지 않으며, 프로젝트별 마지막 성공 경로를 먼저 재검증한다.
 */
export async function resolveWorkerRootByLocator(
  locator: RemoteRawMatchRootLocator,
  allowedRoots: readonly string[],
  label: string,
  samples: readonly RootIdentitySample[],
  options: { cacheFilePath?: string } = {},
): Promise<string> {
  const canonicalAllowedRoots = await Promise.all(allowedRoots.map((root) => realpath(root)));
  const cache = await readWorkerRootCache(options.cacheFilePath);
  const cacheKey = workerRootCacheKey(locator);
  const cachedPath = cache[cacheKey];
  if (cachedPath) {
    try {
      const canonical = await resolveRoot(cachedPath, canonicalAllowedRoots, label);
      if (await candidateMatchesSamples(canonical, samples)) return canonical;
    } catch {
      // 재마운트나 폴더 이동으로 무효화된 캐시는 아래 자동 탐색으로 교체한다.
    }
    delete cache[cacheKey];
  }

  const requestedName = normalizedFolderIdentity(locator.folderName);
  const nameCandidates: string[] = [];
  const matchedCandidates: string[] = [];
  const queue = await workerRootSearchQueue(canonicalAllowedRoots);
  const visited = new Set<string>();
  while (queue.length && visited.size < WORKER_ROOT_SEARCH_LIMIT) {
    const current = queue.shift()!;
    const canonicalKey = current.directory.normalize("NFC");
    if (visited.has(canonicalKey)) continue;
    visited.add(canonicalKey);
    if (normalizedFolderIdentity(path.basename(current.directory)) === requestedName) {
      nameCandidates.push(current.directory);
      if (await candidateMatchesSamples(current.directory, samples)) matchedCandidates.push(current.directory);
    }
    if (current.depth >= WORKER_ROOT_SEARCH_DEPTH) continue;
    let entries: Dirent[];
    try {
      entries = await readdir(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
    }
  }

  const preferred = matchedCandidates.filter((candidate) => pathMatchesHint(candidate, locator.relativePath));
  const resolved = preferred.length === 1
    ? preferred[0]
    : preferred.length === 0 && matchedCandidates.length === 1
      ? matchedCandidates[0]
      : null;
  if (!resolved) {
    const candidates = (matchedCandidates.length ? matchedCandidates : nameCandidates).slice(0, 10);
    const candidateText = candidates.length ? candidates.join(" · ") : "없음";
    if (matchedCandidates.length > 1) {
      throw new Error(`${label} '${locator.folderName}' 후보가 여러 곳입니다. 찾은 후보: ${candidateText}`);
    }
    throw new Error(`${label} '${locator.folderName}'을 찾지 못했습니다. 찾은 후보: ${candidateText}`);
  }

  cache[cacheKey] = resolved;
  await writeWorkerRootCache(options.cacheFilePath, cache);
  return resolved;
}

export async function resolveWorkerRoot(
  input: string,
  allowedRoots: readonly string[],
  label: string,
  samples: readonly RootIdentitySample[],
): Promise<string> {
  try {
    const direct = await resolveRoot(input, allowedRoots, label);
    const matches = await Promise.all(samples.slice(0, 2).map((sample) => sampleMatches(direct, sample)));
    if (!matches.every(Boolean)) throw new Error(`${label}의 표본 파일이 브라우저에서 확인한 원본과 다릅니다.`);
    return direct;
  } catch (directError) {
    const matches = await searchMatchingRoots(allowedRoots, input, samples);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`${label} 후보가 여러 곳입니다. 브릿지에서 실제 촬영 폴더를 다시 선택해 주세요.`);
    throw new Error(`${directError instanceof Error ? directError.message : `${label}을 찾지 못했습니다.`} 브릿지에서 실제 촬영 폴더를 다시 선택해 주세요.`);
  }
}

export async function matchingXmp(jpgPath: string): Promise<string | null> {
  const directory = path.dirname(jpgPath);
  const basename = path.basename(jpgPath, path.extname(jpgPath)).normalize("NFC").toLocaleLowerCase("en-US");
  const names = await readdir(directory);
  const match = names.find((name) => path.extname(name).toLocaleLowerCase("en-US") === ".xmp"
    && path.basename(name, path.extname(name)).normalize("NFC").toLocaleLowerCase("en-US") === basename);
  return match ? path.join(directory, match) : null;
}
