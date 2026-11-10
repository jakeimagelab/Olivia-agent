import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseCaptureTime } from "@/lib/selectMatch/captureTime";
import type {
  RemoteRawMatchCopyFailure,
  RemoteRawMatchCopyPayload,
  RemoteRawMatchCopyResult,
} from "@/lib/selectMatch/remoteRawMatch";

const execFileAsync = promisify(execFile);
const RAW_HEADER_BYTES = 4 * 1024 * 1024;

export type FileAttributeSnapshot = {
  size: number;
  mtimeSeconds: number;
  birthtimeSeconds: number;
  device: number;
  xattrs: Record<string, string>;
};

export type RawMatchCopyExecutionOptions = {
  allowedRoots?: string[];
  shouldCancel?: () => Promise<boolean>;
  onProgress?: (progress: { current: number; total: number; message: string }) => Promise<void> | void;
};

type PreservedOperationResult = {
  source: string;
  destination: string;
  attributeVerified: true;
  moved: boolean;
};

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function safeRelativePath(value: string, label: string): string {
  if (!value || value.includes("\0") || path.isAbsolute(value)) throw new Error(`${label}은 안전한 상대경로여야 합니다.`);
  const segments = value.split(/[\\/]+/u).filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${label}이 올바르지 않습니다.`);
  }
  return segments.join(path.sep);
}

async function existingAllowedRoots(env: NodeJS.ProcessEnv): Promise<string[]> {
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

async function resolveSourceFile(root: string, relativePath: string, label: string): Promise<string> {
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

async function resolveDestinationDirectory(root: string, relativePath: string, label: string): Promise<string> {
  const candidate = path.resolve(root, safeRelativePath(relativePath, label));
  if (!isInside(root, candidate)) throw new Error(`${label}이 기준 폴더 밖입니다.`);
  await mkdir(candidate, { recursive: true });
  const canonical = await realpath(candidate);
  if (!isInside(root, canonical)) throw new Error(`${label}이 기준 폴더 밖을 가리킵니다.`);
  const metadata = await lstat(canonical);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`${label}이 안전한 폴더가 아닙니다.`);
  return canonical;
}

async function readXattrs(filePath: string): Promise<Record<string, string>> {
  if (process.platform !== "darwin") return {};
  const { stdout } = await execFileAsync("/usr/bin/xattr", [filePath], { maxBuffer: 4 * 1024 * 1024 });
  const names = stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).sort();
  const values = await Promise.all(names.map(async (name) => {
    const result = await execFileAsync("/usr/bin/xattr", ["-px", name, filePath], { maxBuffer: 4 * 1024 * 1024 });
    return [name, result.stdout.replace(/\s+/gu, "").toLocaleLowerCase("en-US")] as const;
  }));
  return Object.fromEntries(values);
}

async function darwinStatSeconds(filePath: string, format: "%m" | "%B", fallback: number): Promise<number> {
  if (process.platform !== "darwin") return Math.trunc(fallback / 1000);
  const { stdout } = await execFileAsync("/usr/bin/stat", ["-f", format, filePath]);
  const value = Number(stdout.trim());
  return Number.isFinite(value) ? value : Math.trunc(fallback / 1000);
}

export async function readFileAttributeSnapshot(filePath: string): Promise<FileAttributeSnapshot> {
  const metadata = await stat(filePath);
  return {
    size: metadata.size,
    mtimeSeconds: await darwinStatSeconds(filePath, "%m", metadata.mtimeMs),
    birthtimeSeconds: await darwinStatSeconds(filePath, "%B", metadata.birthtimeMs),
    device: Number(metadata.dev),
    xattrs: await readXattrs(filePath),
  };
}

export function verifyFileAttributeSnapshot(
  source: FileAttributeSnapshot,
  destination: FileAttributeSnapshot,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (source.size !== destination.size) reasons.push(`크기 불일치 ${destination.size}/${source.size}`);
  if (source.mtimeSeconds !== destination.mtimeSeconds) reasons.push("수정일 불일치");
  if (source.birthtimeSeconds !== destination.birthtimeSeconds) reasons.push("생성일 불일치");
  if (JSON.stringify(source.xattrs) !== JSON.stringify(destination.xattrs)) reasons.push("확장속성 불일치");
  if (!("com.apple.quarantine" in source.xattrs) && "com.apple.quarantine" in destination.xattrs) {
    reasons.push("복사본에 격리 속성이 추가됨");
  }
  return { ok: reasons.length === 0, reasons };
}

async function destinationExists(destination: string): Promise<boolean> {
  try {
    await lstat(destination);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Finder 복사와 같은 ditto/rename 경로만 사용하며 대상 파일을 절대 덮어쓰지 않는다. */
export async function copyOrMovePreservingMetadata(input: {
  source: string;
  destinationDirectory: string;
  move: boolean;
}): Promise<PreservedOperationResult> {
  const source = await realpath(input.source);
  const sourceMetadata = await lstat(source);
  if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) throw new Error("원본이 안전한 파일이 아닙니다.");
  const destinationDirectory = await realpath(input.destinationDirectory);
  const destination = path.join(destinationDirectory, path.basename(source));
  if (await destinationExists(destination)) throw new Error("대상 폴더에 같은 이름이 있어 덮어쓰지 않음");

  const sourceSnapshot = await readFileAttributeSnapshot(source);
  const destinationDirectoryMetadata = await stat(destinationDirectory);
  const sameVolume = Number(sourceMetadata.dev) === Number(destinationDirectoryMetadata.dev);

  if (input.move && sameVolume) {
    await rename(source, destination);
    try {
      const checked = verifyFileAttributeSnapshot(sourceSnapshot, await readFileAttributeSnapshot(destination));
      if (!checked.ok) throw new Error(`속성 확인 실패: ${checked.reasons.join(", ")}`);
      return { source, destination, attributeVerified: true, moved: true };
    } catch (error) {
      if (!(await destinationExists(source))) await rename(destination, source).catch(() => undefined);
      throw error;
    }
  }

  const temporary = path.join(destinationDirectory, `.olivia-copy-${randomUUID()}-${path.basename(source)}`);
  try {
    await execFileAsync("/usr/bin/ditto", [source, temporary], { maxBuffer: 4 * 1024 * 1024 });
    const checked = verifyFileAttributeSnapshot(sourceSnapshot, await readFileAttributeSnapshot(temporary));
    if (!checked.ok) throw new Error(`속성 확인 실패: ${checked.reasons.join(", ")}`);
    await rename(temporary, destination);
    const finalCheck = verifyFileAttributeSnapshot(sourceSnapshot, await readFileAttributeSnapshot(destination));
    if (!finalCheck.ok) throw new Error(`최종 속성 확인 실패: ${finalCheck.reasons.join(", ")}`);
    if (input.move) await unlink(source);
    return { source, destination, attributeVerified: true, moved: input.move };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (!input.move || await destinationExists(source)) await rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
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

async function assertRawIdentity(filePath: string, expectedSize: number, expectedCaptureTimeMs: number | null): Promise<void> {
  const metadata = await stat(filePath);
  if (metadata.size !== expectedSize) throw new Error(`표본 파일 크기가 다릅니다 (${metadata.size}/${expectedSize})`);
  if (expectedCaptureTimeMs !== null) {
    const actual = await readCaptureTimeMs(filePath);
    if (actual === null || Math.abs(actual - expectedCaptureTimeMs) > 2_000) {
      throw new Error("표본 파일 촬영시각이 다릅니다.");
    }
  }
}

type RootIdentitySample = {
  relativePath: string;
  expectedSize: number;
  expectedCaptureTimeMs: number | null;
};

async function sampleMatches(root: string, sample: RootIdentitySample): Promise<boolean> {
  try {
    const source = await resolveSourceFile(root, sample.relativePath, "표본 파일");
    await assertRawIdentity(source, sample.expectedSize, sample.expectedCaptureTimeMs);
    return true;
  } catch {
    return false;
  }
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

async function resolveWorkerRoot(
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
    if (matches.length > 1) throw new Error(`${label} 후보가 여러 곳입니다. Mac Studio의 절대경로를 직접 입력해 주세요.`);
    throw new Error(`${directError instanceof Error ? directError.message : `${label}을 찾지 못했습니다.`} Mac Studio의 절대경로를 직접 입력해 주세요.`);
  }
}

async function matchingXmp(jpgPath: string): Promise<string | null> {
  const directory = path.dirname(jpgPath);
  const basename = path.basename(jpgPath, path.extname(jpgPath)).normalize("NFC").toLocaleLowerCase("en-US");
  const names = await readdir(directory);
  const match = names.find((name) => path.extname(name).toLocaleLowerCase("en-US") === ".xmp"
    && path.basename(name, path.extname(name)).normalize("NFC").toLocaleLowerCase("en-US") === basename);
  return match ? path.join(directory, match) : null;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildWorkerMatchLog(
  rows: RemoteRawMatchCopyPayload["logRows"],
  attributesByPath: ReadonlyMap<string, "통과" | "실패">,
): string {
  const header = ["JPG 이름", "JPG 경로", "JPG 촬영시각", "RAW 경로", "RAW 촬영시각", "결과", "속성 확인"];
  return `\uFEFF${[
    header,
    ...rows.map((row) => [
      row.jpgName,
      row.jpgPath,
      row.jpgCaptureTime,
      row.rawPath,
      row.rawCaptureTime,
      row.result,
      attributesByPath.get(row.jpgPath) ?? attributesByPath.get(row.rawPath) ?? "-",
    ]),
  ].map((columns) => columns.map(csvCell).join(",")).join("\r\n")}`;
}

export async function executeRemoteRawMatchCopy(
  payload: RemoteRawMatchCopyPayload,
  options: RawMatchCopyExecutionOptions = {},
): Promise<RemoteRawMatchCopyResult> {
  if (!payload.items.length) throw new Error("복사할 RAW 항목이 없습니다.");
  const allowedRoots = options.allowedRoots?.length
    ? await Promise.all(options.allowedRoots.map((root) => realpath(root)))
    : await existingAllowedRoots(process.env);
  if (!allowedRoots.length) throw new Error("Mac Studio 사진 저장소가 연결되어 있지 않습니다.");
  const rawSamples = payload.items.map((item) => ({
    relativePath: item.rawPath,
    expectedSize: item.rawExpectedSize,
    expectedCaptureTimeMs: item.rawExpectedCaptureTimeMs,
  }));
  const jpgSamples = payload.items.flatMap((item) => item.jpgPath && item.jpgExpectedSize !== undefined && item.jpgExpectedCaptureTimeMs !== undefined
    ? [{ relativePath: item.jpgPath, expectedSize: item.jpgExpectedSize, expectedCaptureTimeMs: item.jpgExpectedCaptureTimeMs }]
    : []);
  const rawRoot = await resolveWorkerRoot(payload.rawRootPath, allowedRoots, "RAW 기준 폴더", rawSamples);
  const jpgRoot = payload.jpgRootPath
    ? await resolveWorkerRoot(payload.jpgRootPath, allowedRoots, "JPG 기준 폴더", jpgSamples)
    : null;

  // 잘못 연결된 브라우저 핸들 경로로 전체 작업을 시작하지 않도록 처음 두 표본을 먼저 확인한다.
  for (const item of payload.items.slice(0, 2)) {
    const source = await resolveSourceFile(rawRoot, item.rawPath, "RAW 원본");
    await assertRawIdentity(source, item.rawExpectedSize, item.rawExpectedCaptureTimeMs);
  }

  let copied = 0;
  let rawMoved = 0;
  let jpgMoved = 0;
  let xmpMoved = 0;
  let attributePassed = 0;
  let attributeFailed = 0;
  const failures: RemoteRawMatchCopyFailure[] = [];
  const attributesByPath = new Map<string, "통과" | "실패">();
  let outputDir = "";

  for (let index = 0; index < payload.items.length; index += 1) {
    if (await options.shouldCancel?.()) break;
    const item = payload.items[index];
    await options.onProgress?.({ current: index, total: payload.items.length, message: `${path.basename(item.rawPath)} 속성 보존 복사 중` });
    try {
      const rawSource = await resolveSourceFile(rawRoot, item.rawPath, "RAW 원본");
      await assertRawIdentity(rawSource, item.rawExpectedSize, item.rawExpectedCaptureTimeMs);
      const rawDestination = await resolveDestinationDirectory(rawRoot, item.destDir, "RAW 결과 폴더");
      outputDir = rawDestination;
      await copyOrMovePreservingMetadata({
        source: rawSource,
        destinationDirectory: rawDestination,
        move: item.rawAction === "move",
      });
      if (item.rawAction === "move") rawMoved += 1;
      else copied += 1;
      attributePassed += 1;

      if (item.jpgPath && item.jpgDestDir) {
        if (!jpgRoot) throw new Error("JPG 이동 기준 폴더가 없습니다.");
        const jpgSource = await resolveSourceFile(jpgRoot, item.jpgPath, "JPG 원본");
        const jpgDestination = await resolveDestinationDirectory(jpgRoot, item.jpgDestDir, "JPG 보정본 폴더");
        const xmpSource = await matchingXmp(jpgSource);
        await copyOrMovePreservingMetadata({ source: jpgSource, destinationDirectory: jpgDestination, move: true });
        jpgMoved += 1;
        attributePassed += 1;
        if (xmpSource) {
          await copyOrMovePreservingMetadata({ source: xmpSource, destinationDirectory: jpgDestination, move: true });
          xmpMoved += 1;
          attributePassed += 1;
        }
      }
      attributesByPath.set(item.rawPath, "통과");
      if (item.jpgPath) attributesByPath.set(item.jpgPath, "통과");
    } catch (error) {
      attributeFailed += 1;
      attributesByPath.set(item.rawPath, "실패");
      if (item.jpgPath) attributesByPath.set(item.jpgPath, "실패");
      failures.push({ path: item.rawPath, error: error instanceof Error ? error.message : "파일 처리 실패" });
    }
    await options.onProgress?.({ current: index + 1, total: payload.items.length, message: `${index + 1}/${payload.items.length}장 처리` });
  }

  if (!outputDir) outputDir = await resolveDestinationDirectory(rawRoot, payload.items[0].destDir, "RAW 결과 폴더");
  const logPath = payload.logRows.length ? path.join(outputDir, "_match_log.csv") : "";
  if (logPath) await writeFile(logPath, buildWorkerMatchLog(payload.logRows, attributesByPath), { encoding: "utf8", flag: "w" });
  if (payload.openOutput && process.platform === "darwin") {
    await execFileAsync("/usr/bin/open", [outputDir]).catch(() => undefined);
  }

  return {
    ok: true,
    status: "PHOTO_RAW_MATCH_COPY_COMPLETED",
    outputDir,
    copied,
    rawMoved,
    jpgMoved,
    xmpMoved,
    failed: failures.length,
    failures,
    attributePassed,
    attributeFailed,
    logPath,
  };
}
