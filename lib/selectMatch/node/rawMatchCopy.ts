import { execFile } from "node:child_process";
import {
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  RemoteRawMatchCopyFailure,
  RemoteRawMatchCopyPayload,
  RemoteRawMatchCopyResult,
  RemoteRawMatchCopyWarning,
} from "@/lib/selectMatch/remoteRawMatch";
import {
  copyOrMovePreservingMetadata,
  fileSystemEntryExists as destinationExists,
  type PreservedOperationResult,
} from "@/lib/selectMatch/node/preservedFileOperation";
import {
  assertRawIdentity,
  existingAllowedRoots,
  matchingXmp,
  resolveDestinationDirectory,
  resolveExistingDestinationDirectory,
  resolveSourceFile,
  resolveWorkerRoot,
  resolveWorkerRootByLocator,
  safeRelativePath,
  sampleMatches,
} from "@/lib/selectMatch/node/rawMatchPathResolution";

export { copyOrMovePreservingMetadata } from "@/lib/selectMatch/node/preservedFileOperation";
export {
  readFileAttributeSnapshot,
  verifyFileAttributeSnapshot,
  type FileAttributeSnapshot,
} from "@/lib/selectMatch/node/rawMatchFileAttributes";

const execFileAsync = promisify(execFile);

export type RawMatchCopyExecutionOptions = {
  allowedRoots?: string[];
  rootCacheFilePath?: string;
  shouldCancel?: () => Promise<boolean>;
  onProgress?: (progress: { current: number; total: number; message: string }) => Promise<void> | void;
};

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
    alternativeRelativePaths: item.rawAction === "move"
      ? [path.posix.join(item.destDir, path.posix.basename(item.rawPath.replaceAll("\\", "/")))]
      : [],
    expectedSize: item.rawExpectedSize,
    expectedCaptureTimeMs: item.rawExpectedCaptureTimeMs,
  }));
  const jpgSamples = payload.items.flatMap((item) => item.jpgPath && item.jpgExpectedSize !== undefined && item.jpgExpectedCaptureTimeMs !== undefined
    ? [{
        relativePath: item.jpgPath,
        alternativeRelativePaths: item.jpgDestDir
          ? [path.posix.join(item.jpgDestDir, path.posix.basename(item.jpgPath.replaceAll("\\", "/")))]
          : [],
        expectedSize: item.jpgExpectedSize,
        expectedCaptureTimeMs: item.jpgExpectedCaptureTimeMs,
      }]
    : []);
  await options.onProgress?.({ current: 0, total: payload.items.length, message: "RAW 원본 폴더를 찾는 중" });
  const rawRoot = payload.rawRoot
    ? await resolveWorkerRootByLocator(payload.rawRoot, allowedRoots, "RAW 원본 폴더", rawSamples, {
        cacheFilePath: options.rootCacheFilePath,
      })
    : await resolveWorkerRoot(payload.rawRootPath ?? "", allowedRoots, "RAW 원본 폴더", rawSamples);
  if (payload.jpgRoot || payload.jpgRootPath) {
    await options.onProgress?.({ current: 0, total: payload.items.length, message: "JPG 기준 폴더를 찾는 중" });
  }
  const jpgRoot = payload.jpgRoot
    ? await resolveWorkerRootByLocator(payload.jpgRoot, allowedRoots, "JPG 기준 폴더", jpgSamples, {
        cacheFilePath: options.rootCacheFilePath,
      })
    : payload.jpgRootPath
      ? await resolveWorkerRoot(payload.jpgRootPath, allowedRoots, "JPG 기준 폴더", jpgSamples)
    : null;

  // 잘못 연결된 브라우저 핸들 경로로 전체 작업을 시작하지 않도록 처음 두 표본을 먼저 확인한다.
  for (const sample of rawSamples.slice(0, 2)) {
    if (!await sampleMatches(rawRoot, sample)) throw new Error(`RAW 표본 파일을 찾지 못했습니다: ${sample.relativePath}`);
  }

  let copied = 0;
  let alreadyCopied = 0;
  let rawMoved = 0;
  let jpgMoved = 0;
  let xmpMoved = 0;
  let attributePassed = 0;
  let attributeFailed = 0;
  const failures: RemoteRawMatchCopyFailure[] = [];
  const warnings: RemoteRawMatchCopyWarning[] = [];
  const attributesByPath = new Map<string, "통과" | "실패">();
  let outputDir = "";

  const recordWarnings = (
    stage: RemoteRawMatchCopyFailure["stage"],
    relativePath: string,
    operationWarnings: readonly string[],
  ) => {
    for (const warning of operationWarnings) warnings.push({ stage, path: relativePath, warning });
  };

  const existingCompletedDestination = async (
    root: string,
    relativeSourcePath: string,
    relativeDestinationDirectory: string,
    expectedSize: number,
    expectedCaptureTimeMs: number | null,
  ): Promise<string | null> => {
    const destinationDirectory = await resolveExistingDestinationDirectory(root, relativeDestinationDirectory, "결과 폴더");
    if (!destinationDirectory) return null;
    const destination = path.join(destinationDirectory, path.basename(relativeSourcePath));
    if (!await destinationExists(destination)) return null;
    try {
      await assertRawIdentity(destination, expectedSize, expectedCaptureTimeMs);
      return destination;
    } catch {
      return null;
    }
  };

  for (let index = 0; index < payload.items.length; index += 1) {
    if (await options.shouldCancel?.()) break;
    const item = payload.items[index];
    await options.onProgress?.({ current: index, total: payload.items.length, message: `${path.basename(item.rawPath)} 속성 보존 복사 중` });
    let rawSucceeded = false;
    try {
      let rawOperation: PreservedOperationResult;
      try {
        const rawSource = await resolveSourceFile(rawRoot, item.rawPath, "RAW 원본");
        await assertRawIdentity(rawSource, item.rawExpectedSize, item.rawExpectedCaptureTimeMs);
        const rawDestination = await resolveDestinationDirectory(rawRoot, item.destDir, "RAW 결과 폴더");
        rawOperation = await copyOrMovePreservingMetadata({
          source: rawSource,
          destinationDirectory: rawDestination,
          move: item.rawAction === "move",
        });
      } catch (error) {
        const completed = await existingCompletedDestination(
          rawRoot,
          item.rawPath,
          item.destDir,
          item.rawExpectedSize,
          item.rawExpectedCaptureTimeMs,
        );
        if (!completed) throw error;
        rawOperation = {
          source: item.rawPath,
          destination: completed,
          attributeVerified: true,
          moved: item.rawAction === "move",
          alreadyExisted: true,
          warnings: ["원본이 없어 기존 완료 파일의 크기·촬영시각으로 재시도 상태를 확인함"],
        };
      }
      if (!outputDir) {
        const outputRootName = safeRelativePath(item.destDir, "RAW 결과 폴더").split(path.sep)[0];
        outputDir = await resolveExistingDestinationDirectory(rawRoot, outputRootName, "RAW 결과 폴더")
          ?? path.dirname(rawOperation.destination);
      }
      if (rawOperation.alreadyExisted) alreadyCopied += 1;
      else if (item.rawAction === "move") rawMoved += 1;
      else copied += 1;
      attributePassed += 1;
      recordWarnings("raw_copy", item.rawPath, rawOperation.warnings);
      attributesByPath.set(item.rawPath, "통과");
      rawSucceeded = true;
    } catch (error) {
      attributeFailed += 1;
      attributesByPath.set(item.rawPath, "실패");
      failures.push({ stage: "raw_copy", path: item.rawPath, error: error instanceof Error ? error.message : "RAW 처리 실패" });
    }

    if (rawSucceeded && item.jpgPath && item.jpgDestDir) {
      if (!jpgRoot) {
        attributeFailed += 1;
        attributesByPath.set(item.jpgPath, "실패");
        failures.push({ stage: "jpg_move", path: item.jpgPath, error: "JPG 이동 기준 폴더가 없습니다." });
      } else {
        let jpgSucceeded = false;
        let xmpSource: string | null = null;
        try {
          const jpgDestination = await resolveDestinationDirectory(jpgRoot, item.jpgDestDir, "JPG 보정본 폴더");
          let jpgOperation: PreservedOperationResult;
          try {
            const jpgSource = await resolveSourceFile(jpgRoot, item.jpgPath, "JPG 원본");
            xmpSource = await matchingXmp(jpgSource);
            jpgOperation = await copyOrMovePreservingMetadata({ source: jpgSource, destinationDirectory: jpgDestination, move: true });
          } catch (error) {
            const completed = item.jpgExpectedSize === undefined
              ? null
              : await existingCompletedDestination(
                jpgRoot,
                item.jpgPath,
                item.jpgDestDir,
                item.jpgExpectedSize,
                item.jpgExpectedCaptureTimeMs ?? null,
              );
            if (!completed) throw error;
            jpgOperation = {
              source: item.jpgPath,
              destination: completed,
              attributeVerified: true,
              moved: true,
              alreadyExisted: true,
              warnings: ["이미 이동된 JPG를 크기·촬영시각으로 확인함"],
            };
            const sourceCandidate = path.resolve(jpgRoot, safeRelativePath(item.jpgPath, "JPG 원본"));
            xmpSource = await matchingXmp(sourceCandidate).catch(() => null);
          }
          if (!jpgOperation.alreadyExisted) jpgMoved += 1;
          attributePassed += 1;
          recordWarnings("jpg_move", item.jpgPath, jpgOperation.warnings);
          attributesByPath.set(item.jpgPath, "통과");
          jpgSucceeded = true;
        } catch (error) {
          attributeFailed += 1;
          attributesByPath.set(item.jpgPath, "실패");
          failures.push({ stage: "jpg_move", path: item.jpgPath, error: error instanceof Error ? error.message : "JPG 이동 실패" });
        }

        if (jpgSucceeded && xmpSource) {
          try {
            const jpgDestination = await resolveDestinationDirectory(jpgRoot, item.jpgDestDir, "JPG 보정본 폴더");
            const xmpOperation = await copyOrMovePreservingMetadata({ source: xmpSource, destinationDirectory: jpgDestination, move: true });
            if (!xmpOperation.alreadyExisted) xmpMoved += 1;
            attributePassed += 1;
            recordWarnings("xmp_move", path.relative(jpgRoot, xmpSource), xmpOperation.warnings);
          } catch (error) {
            attributeFailed += 1;
            failures.push({ stage: "xmp_move", path: path.relative(jpgRoot, xmpSource), error: error instanceof Error ? error.message : "XMP 이동 실패" });
          }
        }
      }
    }
    await options.onProgress?.({ current: index + 1, total: payload.items.length, message: `${index + 1}/${payload.items.length}장 처리` });
  }

  const rawSuccessCount = copied + alreadyCopied + rawMoved;
  if (rawSuccessCount === 0) {
    const firstFailures = failures
      .filter((failure) => failure.stage === "raw_copy")
      .slice(0, 3)
      .map((failure) => `${failure.path}: ${failure.error}`)
      .join(" · ");
    throw new Error(firstFailures
      ? `RAW 복사가 모두 실패했습니다. ${firstFailures}`
      : "RAW 복사가 완료되지 않았습니다.");
  }
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
    alreadyCopied,
    rawMoved,
    jpgMoved,
    xmpMoved,
    failed: failures.length,
    failures,
    warnings,
    attributePassed,
    attributeFailed,
    logPath,
  };
}
