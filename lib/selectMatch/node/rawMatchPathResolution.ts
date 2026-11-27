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

import { resolvePhotoWorkPath } from "@/lib/person-select/sourceRoots";
import { parseCaptureTime } from "@/lib/selectMatch/captureTime";
import type { LocalRawMatchRootRelation, RemoteRawMatchRootLocator } from "@/lib/selectMatch/remoteRawMatchTypes";

const RAW_HEADER_BYTES = 4 * 1024 * 1024;
const WORKER_ROOT_SEARCH_DEPTH = 4;
const WORKER_ROOT_SEARCH_LIMIT = 50_000;

export class RawMatchSourceMissingError extends Error {}

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
  const metadata = await lstat(candidate).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw new RawMatchSourceMissingError(`${label}을 찾지 못했습니다: ${relativePath}`, { cause: error });
    throw error;
  });
  if (!metadata.isFile()) throw new Error(`${label}이 안전한 파일이 아닙니다.`);
  const canonical = await realpath(candidate);
  if (!isInside(root, canonical)) throw new Error(`${label}이 기준 폴더 밖을 가리킵니다.`);
  if (canonical.normalize("NFC") !== candidate.normalize("NFC")) throw new Error(`${label}이 다른 경로를 가리킵니다.`);
  return canonical;
}

async function findDestinationDirectory(root: string, relativePath: string, label: string, create: boolean): Promise<string | null> {
  let directory = root;
  for (const segment of safeRelativePath(relativePath, label).split(path.sep)) {
    const entry = path.join(directory, segment);
    let metadata = await lstat(entry).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!metadata) {
      if (!create) return null;
      await mkdir(entry).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
      metadata = await lstat(entry);
    }
    if (!metadata.isDirectory()) throw new Error(`${label}이 안전한 폴더가 아닙니다.`);
    directory = await realpath(entry);
    if (!isInside(root, directory) || directory.normalize("NFC") !== entry.normalize("NFC")) {
      throw new Error(`${label}이 다른 경로를 가리킵니다.`);
    }
  }
  return directory;
}

export async function resolveDestinationDirectory(root: string, relativePath: string, label: string): Promise<string> {
  const directory = await findDestinationDirectory(root, relativePath, label, true);
  if (!directory) throw new Error(`${label}을 만들지 못했습니다.`);
  return directory;
}

export async function resolveExistingDestinationDirectory(
  root: string,
  relativePath: string,
  label: string,
): Promise<string | null> {
  return findDestinationDirectory(root, relativePath, label, false);
}

export async function readCaptureTimeMs(filePath: string): Promise<number | null> {
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
  return value.normalize("NFC").trim().toLocaleLowerCase("en-US");
}

function normalizedPathParts(value: string): string[] {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => normalizedFolderIdentity(part))
    .filter(Boolean);
}

function mountIdentity(value: string): string {
  return value.replace(/-\d+$/u, "");
}

function pathMatchesHint(candidate: string, relativePath?: string, volumesRoot?: string): boolean {
  if (!relativePath?.trim()) return false;
  const candidateParts = normalizedPathParts(candidate);
  const hintParts = normalizedPathParts(relativePath);
  if (!hintParts.length || hintParts.length > candidateParts.length) return false;
  const mountIndex = volumesRoot && isInside(volumesRoot, candidate) ? normalizedPathParts(volumesRoot).length : -1;
  return hintParts.every((part, index) => {
    const candidateIndex = candidateParts.length - hintParts.length + index;
    const segment = candidateParts[candidateIndex];
    return part === segment || (candidateIndex === mountIndex && mountIdentity(part) === mountIdentity(segment));
  });
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
  options: { cacheFilePath?: string; requirePathHint?: boolean } = {},
): Promise<string> {
  const canonicalAllowedRoots = await Promise.all(allowedRoots.map((root) => realpath(root)));
  const volumesRoot = canonicalAllowedRoots.find((root) => path.basename(root) === "Volumes");
  const requestedPath = locator.relativePath?.trim();
  const requirePathHint = Boolean(options.requirePathHint && requestedPath);
  if (requestedPath?.startsWith("Volumes/")) {
    if (!volumesRoot) throw new Error("Mac Studio에서 연결된 저장소를 찾을 수 없습니다.");
    const selectedPath = path.join(volumesRoot, safeRelativePath(requestedPath.slice("Volumes/".length), label));
    const selected = await resolveRoot(selectedPath, canonicalAllowedRoots, label);
    if (selected.normalize("NFC") !== selectedPath.normalize("NFC")
      || normalizedFolderIdentity(path.basename(selected)) !== normalizedFolderIdentity(locator.folderName)
      || !await candidateMatchesSamples(selected, samples)) {
      throw new Error(`${label} '${locator.folderName}'이 선택한 저장소의 표본 파일과 일치하지 않습니다.`);
    }
    return selected;
  }
  const cache = await readWorkerRootCache(options.cacheFilePath);
  const cacheKey = workerRootCacheKey(locator);
  const cachedPath = cache[cacheKey];
  if (cachedPath) {
    try {
      const canonical = await resolveRoot(cachedPath, canonicalAllowedRoots, label);
      if ((!requirePathHint || pathMatchesHint(canonical, requestedPath, volumesRoot))
        && await candidateMatchesSamples(canonical, samples)) return canonical;
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
    const candidateName = normalizedFolderIdentity(path.basename(current.directory));
    if (candidateName === requestedName || (volumesRoot === path.dirname(current.directory) && mountIdentity(candidateName) === mountIdentity(requestedName))) {
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

  const exact = matchedCandidates.filter((candidate) => pathMatchesHint(candidate, requestedPath));
  const preferred = exact.length ? exact : matchedCandidates.filter((candidate) => pathMatchesHint(candidate, requestedPath, volumesRoot));
  const resolved = preferred.length === 1
    ? preferred[0]
    : !requirePathHint && preferred.length === 0 && matchedCandidates.length === 1
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

/** Resolve RAW only inside the selected JPG folder or its two nearest ancestors. */
export async function resolveWorkerRawRootNearJpg(
  jpgRoot: string,
  locator: RemoteRawMatchRootLocator,
  allowedRoots: readonly string[],
  samples: readonly RootIdentitySample[],
  relation?: LocalRawMatchRootRelation,
): Promise<string> {
  const device = (await stat(jpgRoot)).dev;
  let ancestor = jpgRoot;
  for (let depth = 0; depth <= 2; depth += 1) {
    if (path.basename(ancestor) === "Volumes"
      || !allowedRoots.some((root) => isInside(root, ancestor))
      || (await stat(ancestor)).dev !== device) break;
    if (!relation || relation.parentSteps === depth) {
      const requested = relation?.subdirectory
        ? path.join(ancestor, safeRelativePath(relation.subdirectory, "RAW 폴더")) : ancestor;
      const candidate = await realpath(requested).catch(() => null);
      if (candidate && isInside(ancestor, candidate)
        && normalizedFolderIdentity(path.basename(candidate)) === normalizedFolderIdentity(locator.folderName)
        && (await stat(candidate)).dev === device && await candidateMatchesSamples(candidate, samples)) return candidate;
      if (relation) break;
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  throw new Error(`JPG 폴더 '${path.basename(jpgRoot)}'와 상위 두 단계 안에서 RAW 폴더 '${locator.folderName}'의 표본을 찾지 못했습니다.`);
}

/**
 * LIST_FOLDER에서 사용자가 직접 고른 NAS 폴더를 표본 파일 없이 다시 연다.
 * 선택 경로는 SOURCE_ROOT 기준 상대경로이므로 허용 루트 각각에서만 확인하고,
 * 이름이 같은 다른 폴더를 임의로 고르지 않는다.
 */
export async function resolveWorkerRootFromRemoteSelection(
  locator: RemoteRawMatchRootLocator,
  allowedRoots: readonly string[],
  label: string,
): Promise<string> {
  if (!locator.relativePath?.trim()) throw new Error(`${label}의 NAS 선택 경로가 없습니다.`);
  if (/^root-\d+(?:[\\/]|$)/u.test(locator.relativePath.trim())) {
    const selected = await resolvePhotoWorkPath(locator.relativePath);
    if (normalizedFolderIdentity(path.basename(selected.canonicalPath)) !== normalizedFolderIdentity(locator.folderName)) {
      throw new Error(`${label}의 선택 폴더 이름이 일치하지 않습니다: ${locator.folderName}`);
    }
    return selected.canonicalPath;
  }
  const relativePath = safeRelativePath(locator.relativePath, label);
  const requestedName = normalizedFolderIdentity(locator.folderName);
  const resolved = new Set<string>();
  const attempts: string[] = [];

  for (const allowedRoot of allowedRoots) {
    let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(allowedRoot);
    } catch {
      continue;
    }
    const candidate = path.resolve(canonicalRoot, relativePath);
    attempts.push(candidate);
    if (!isInside(canonicalRoot, candidate)) continue;
    try {
      const canonical = await realpath(candidate);
      if (!isInside(canonicalRoot, canonical)) continue;
      const metadata = await lstat(canonical);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) continue;
      if (normalizedFolderIdentity(path.basename(canonical)) !== requestedName) continue;
      resolved.add(canonical);
    } catch {
      // 다른 허용 루트에서 같은 상대경로를 계속 확인한다.
    }
  }

  if (resolved.size === 1) return [...resolved][0];
  if (resolved.size > 1) {
    throw new Error(`${label} '${locator.folderName}' 후보가 여러 곳입니다. 찾은 후보: ${[...resolved].join(" · ")}`);
  }
  throw new Error(`${label} '${locator.folderName}'을 찾지 못했습니다. 확인한 후보: ${attempts.slice(0, 10).join(" · ") || "없음"}`);
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
  const matches = (await readdir(directory, { withFileTypes: true }))
    .filter(({ name }) => path.extname(name).toLocaleLowerCase("en-US") === ".xmp"
      && path.basename(name, path.extname(name)).normalize("NFC").toLocaleLowerCase("en-US") === basename);
  if (matches.length > 1) throw new Error("같은 이름의 XMP가 여러 개 있습니다.");
  const xmp = matches[0];
  if (xmp && !xmp.isFile()) throw new Error("XMP가 안전한 파일이 아닙니다.");
  return xmp ? path.join(directory, xmp.name) : null;
}
