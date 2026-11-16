import { execFile } from "node:child_process";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";
import { copyOrMovePreservingMetadata } from "@/lib/selectMatch/node/preservedFileOperation";
import {
  existingAllowedRoots,
  matchingXmp,
  readCaptureTimeMs,
  resolveDestinationDirectory,
  resolveSourceFile,
  resolveWorkerRootByLocator,
  resolveWorkerRootFromRemoteSelection,
  type RootIdentitySample,
} from "@/lib/selectMatch/node/rawMatchPathResolution";
import type {
  RemoteBridgeRawMatchFailure,
  RemoteBridgeRawMatchPayload,
  RemoteBridgeRawMatchResult,
} from "@/lib/selectMatch/remoteBridgeRawMatchTypes";

const execFileAsync = promisify(execFile);
const MATCH_TOLERANCE_MS = 2_000;

type RawCandidate = {
  absolutePath: string;
  relativePath: string;
  name: string;
  size: number;
  captureTimeMs: number | null;
};

function fileKey(value: string): string {
  return path.basename(value, path.extname(value)).normalize("NFC").toLocaleLowerCase("en-US");
}

function normalizedSegment(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("en-US");
}

function shouldSkipDirectory(name: string): boolean {
  const normalized = normalizedSegment(name);
  return normalized.includes("jpg")
    || normalized === "selected_raw"
    || isDeliveredRoundFolder(name.normalize("NFC"));
}

async function collectRawCandidates(
  projectRoot: string,
  selectedKeys: ReadonlySet<string>,
): Promise<Map<string, RawCandidate[]>> {
  const result = new Map<string, RawCandidate[]>();
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > 8) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) await visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).slice(1).toLocaleLowerCase("en-US");
      if (!SELECT_MATCH_RAW_EXTENSIONS.has(extension)) continue;
      const key = fileKey(entry.name);
      if (!selectedKeys.has(key)) continue;
      const metadata = await stat(absolutePath);
      const candidate: RawCandidate = {
        absolutePath,
        relativePath: path.relative(projectRoot, absolutePath),
        name: entry.name,
        size: metadata.size,
        captureTimeMs: await readCaptureTimeMs(absolutePath),
      };
      result.set(key, [...(result.get(key) ?? []), candidate]);
    }
  };
  await visit(projectRoot, 0);
  return result;
}

function chooseCandidate(
  candidates: readonly RawCandidate[],
  jpgCaptureTimeMs: number,
  jpgRelativePath: string,
): RawCandidate | null {
  const matched = candidates.filter((candidate) => candidate.captureTimeMs !== null
    && Math.abs(candidate.captureTimeMs - jpgCaptureTimeMs) <= MATCH_TOLERANCE_MS);
  if (matched.length === 1) return matched[0];
  if (matched.length < 2) return null;
  const first = matched[0];
  const identicalCopies = matched.every((candidate) => candidate.size === first.size
    && candidate.captureTimeMs === first.captureTimeMs);
  if (!identicalCopies) return null;
  const jpgParent = normalizedSegment(path.basename(path.dirname(jpgRelativePath)));
  return matched.find((candidate) => normalizedSegment(path.basename(path.dirname(candidate.relativePath))) === jpgParent)
    ?? matched[0];
}

export async function executeRemoteBridgeRawMatch(
  payload: RemoteBridgeRawMatchPayload,
  options: {
    rootCacheFilePath?: string;
    shouldCancel?: () => Promise<boolean>;
    onProgress?: (progress: { current: number; total: number; message: string }) => void | Promise<void>;
  } = {},
): Promise<RemoteBridgeRawMatchResult> {
  const moveJpgs = payload.moveJpgs !== false;
  const allowedRoots = await existingAllowedRoots(process.env);
  if (!allowedRoots.length) throw new Error("Mac Studio에서 사진 저장소를 찾지 못했습니다.");
  const samples: RootIdentitySample[] = moveJpgs ? payload.selectedJpgs.slice(0, 2).map((jpg) => ({
    relativePath: jpg.relativePath,
    expectedSize: jpg.size,
    expectedCaptureTimeMs: jpg.captureTimeMs,
  })) : [];
  await options.onProgress?.({ current: 0, total: payload.selectedJpgs.length, message: `${payload.projectRoot.folderName} 촬영 폴더를 찾는 중` });
  const projectRoot = moveJpgs
    ? await resolveWorkerRootByLocator(
      payload.projectRoot,
      allowedRoots,
      "촬영 폴더",
      samples,
      { cacheFilePath: options.rootCacheFilePath },
    )
    : await resolveWorkerRootFromRemoteSelection(payload.projectRoot, allowedRoots, "NAS 촬영 폴더");
  if (moveJpgs) {
    if (!payload.currentJpgDirectory) throw new Error("JPG 기준 폴더 경로가 없습니다.");
    const jpgDirectory = await realpath(path.resolve(projectRoot, payload.currentJpgDirectory));
    const jpgDirectoryMetadata = await lstat(jpgDirectory);
    if (jpgDirectoryMetadata.isSymbolicLink() || !jpgDirectoryMetadata.isDirectory()) {
      throw new Error(`JPG 폴더를 찾지 못했습니다: ${payload.currentJpgDirectory}`);
    }
  }

  await options.onProgress?.({ current: 0, total: payload.selectedJpgs.length, message: "파일명과 촬영시각으로 RAW를 확인하는 중" });
  const selectedKeys = new Set(payload.selectedJpgs.map((jpg) => fileKey(jpg.name)));
  const candidatesByKey = await collectRawCandidates(projectRoot, selectedKeys);
  const outputDir = await resolveDestinationDirectory(projectRoot, "Selected_RAW", "RAW 결과 폴더");
  const deliveredDir = moveJpgs
    ? await resolveDestinationDirectory(
      projectRoot,
      path.join(payload.currentJpgDirectory ?? "", payload.deliveredFolderName ?? ""),
      "JPG 보정본 폴더",
    )
    : "";
  const failures: RemoteBridgeRawMatchFailure[] = [];
  let confirmed = 0;
  let copied = 0;
  let alreadyCopied = 0;
  let jpgMoved = 0;
  let xmpMoved = 0;
  let needsReview = 0;

  for (let index = 0; index < payload.selectedJpgs.length; index += 1) {
    if (await options.shouldCancel?.()) break;
    const jpg = payload.selectedJpgs[index];
    await options.onProgress?.({ current: index, total: payload.selectedJpgs.length, message: `${jpg.name} RAW 매칭 중` });
    if (jpg.captureTimeMs === null) {
      needsReview += 1;
      failures.push({ stage: "match", fileName: jpg.name, error: "JPG 촬영시각 없음" });
      continue;
    }
    const rawCandidates = candidatesByKey.get(fileKey(jpg.name)) ?? [];
    const raw = chooseCandidate(rawCandidates, jpg.captureTimeMs, jpg.relativePath);
    if (!raw) {
      needsReview += 1;
      const hasTimedCandidate = rawCandidates.some((candidate) => candidate.captureTimeMs !== null);
      failures.push({
        stage: "match",
        fileName: jpg.name,
        error: rawCandidates.length === 0
          ? "같은 파일명의 RAW 없음"
          : !hasTimedCandidate
            ? "RAW 촬영시각 없음"
            : rawCandidates.length > 1
              ? "촬영시각이 맞는 RAW 후보 여러 개"
              : "촬영시각 불일치",
      });
      continue;
    }
    confirmed += 1;
    try {
      const rawOperation = await copyOrMovePreservingMetadata({
        source: raw.absolutePath,
        destinationDirectory: outputDir,
        move: false,
      });
      if (rawOperation.alreadyExisted) alreadyCopied += 1;
      else copied += 1;
    } catch (error) {
      failures.push({ stage: "raw_copy", fileName: raw.name, error: error instanceof Error ? error.message : "RAW 복사 실패" });
      continue;
    }

    if (moveJpgs) {
      let xmpPath: string | null = null;
      try {
        const jpgSource = await resolveSourceFile(projectRoot, jpg.relativePath, "JPG 원본");
        xmpPath = await matchingXmp(jpgSource);
        const operation = await copyOrMovePreservingMetadata({ source: jpgSource, destinationDirectory: deliveredDir, move: true });
        if (!operation.alreadyExisted) jpgMoved += 1;
      } catch (error) {
        failures.push({ stage: "jpg_move", fileName: jpg.name, error: error instanceof Error ? error.message : "JPG 이동 실패" });
        continue;
      }
      if (xmpPath) {
        try {
          const operation = await copyOrMovePreservingMetadata({ source: xmpPath, destinationDirectory: deliveredDir, move: true });
          if (!operation.alreadyExisted) xmpMoved += 1;
        } catch (error) {
          failures.push({ stage: "xmp_move", fileName: path.basename(xmpPath), error: error instanceof Error ? error.message : "XMP 이동 실패" });
        }
      }
    }
    await options.onProgress?.({ current: index + 1, total: payload.selectedJpgs.length, message: `${index + 1}/${payload.selectedJpgs.length}장 처리` });
  }

  if (confirmed === 0) {
    const details = failures.slice(0, 5).map((failure) => `${failure.fileName}: ${failure.error}`).join(" · ");
    throw new Error(details ? `확정된 RAW가 없습니다. ${details}` : "확정된 RAW가 없습니다.");
  }
  if (payload.openOutput && process.platform === "darwin") {
    await execFileAsync("/usr/bin/open", [outputDir]).catch(() => undefined);
  }
  return {
    ok: true,
    status: "PHOTO_BRIDGE_RAW_MATCH_COMPLETED",
    selected: payload.selectedJpgs.length,
    confirmed,
    copied,
    alreadyCopied,
    jpgMoved,
    xmpMoved,
    needsReview,
    failed: failures.filter((failure) => failure.stage !== "match").length,
    outputDir,
    deliveredDir,
    failures,
  };
}
