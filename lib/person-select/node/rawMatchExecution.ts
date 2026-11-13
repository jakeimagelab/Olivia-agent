import path from "node:path";
import { mkdir, open } from "node:fs/promises";

import { normalizeNfc } from "@/lib/person-select/core";
import {
  type PersonSelectRawLabelNames,
  type PersonSelectRawMatchMode,
  type PersonSelectRawMatchTarget,
} from "@/lib/person-select/rawMatch";
import {
  markPersonSelectRawSidecar,
  type PersonSelectRawMarkFile,
} from "@/lib/person-select/node/rawMarkFileOperations";
import {
  personSelectRawBasename,
  type PersonSelectRawFile,
} from "@/lib/person-select/node/rawFileIndex";
import { resolveCaptureTimeCandidate } from "@/lib/selectMatch/captureMatch";
import { parseCaptureTime, type CaptureTime } from "@/lib/selectMatch/captureTime";
import { copyOrMovePreservingMetadata } from "@/lib/selectMatch/node/rawMatchCopy";

export type PersonSelectRawReviewItem = {
  owner: string;
  jpg: string;
  reason: string;
  candidates?: string[];
  stage?: string;
  error?: string;
};

export type PersonSelectRawMatchExecutionResult = {
  matched: Array<{ name: string; jpg: string; raw: string; attributeVerified: boolean }>;
  alreadyCopied: Array<{ name: string; raw: string }>;
  missing: Array<{ name: string; jpg: string }>;
  ambiguous: Array<{ name: string; jpg: string; candidates: string[] }>;
  timeMismatch: Array<{ name: string; jpg: string; candidates: string[] }>;
  missingTime: Array<{ name: string; jpg: string; candidates: string[] }>;
  conflicts: Array<{ name: string; raw: string }>;
  markedSidecars: Array<{ rawPath: string; sidecarPath: string; created: boolean }>;
  markFailures: Array<{ raw: string; error: string }>;
  copyFailures: Array<{
    stage: "raw_copy";
    name: string;
    jpg: string;
    raw: string;
    error: string;
  }>;
  reviewRequired: PersonSelectRawReviewItem[];
  ratingCount: number;
  colorCount: number;
  conflictCount: number;
};

type ExecutionDependencies = {
  readCaptureTime: (filePath: string) => Promise<CaptureTime | null>;
  createDirectory: (directory: string) => Promise<unknown>;
  copyRaw: (input: {
    source: string;
    destinationDirectory: string;
    move: false;
  }) => Promise<{ alreadyExisted: boolean }>;
  markRawSidecar: (input: {
    raw: PersonSelectRawMarkFile;
    shootingRoot: string;
    jobId: string;
    rating: number | null;
    colorLabel: number | null;
    labelNames: PersonSelectRawLabelNames;
  }) => Promise<{ rawPath: string; sidecarPath: string; created: boolean }>;
};

async function readCaptureTime(filePath: string): Promise<CaptureTime | null> {
  const handle = await open(filePath, "r");
  try {
    const metadata = await handle.stat();
    const length = Math.min(4 * 1024 * 1024, metadata.size);
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead);
    return parseCaptureTime(arrayBuffer);
  } finally {
    await handle.close();
  }
}

const DEFAULT_DEPENDENCIES: ExecutionDependencies = {
  readCaptureTime,
  createDirectory: (directory) => mkdir(directory, { recursive: true }),
  copyRaw: (input) => copyOrMovePreservingMetadata(input),
  markRawSidecar: markPersonSelectRawSidecar,
};

function safeSourceFile(root: string, relativePath: string) {
  const candidate = path.resolve(root, relativePath.split(/[\\/]+/u).filter(Boolean).join(path.sep));
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (relative === "") throw new Error("사진 파일 경로가 없습니다.");
    throw new Error("사진 파일이 촬영 폴더 밖을 가리킵니다.");
  }
  return candidate;
}

function safeFolderName(value: string) {
  return normalizeNfc(value).replace(/[\\/:*?"<>|\0]/g, "_").trim() || "이름없음";
}

function matchingDuplicateRaws(
  picked: PersonSelectRawFile,
  rawCandidates: PersonSelectRawFile[],
  candidateTimes: Array<CaptureTime | null>,
) {
  const pickedIndex = rawCandidates.findIndex((candidate) => candidate.relPath === picked.relPath);
  const pickedTime = candidateTimes[pickedIndex];
  if (!pickedTime) return [picked];
  return rawCandidates.filter((candidate, index) => (
    candidate.size === picked.size
    && candidateTimes[index]?.timestampMs === pickedTime.timestampMs
  ));
}

export async function executePersonSelectRawMatch(input: {
  targets: readonly PersonSelectRawMatchTarget[];
  rawIndex: ReadonlyMap<string, PersonSelectRawFile[]>;
  jpgRoot: string;
  shootingRoot: string;
  outputRoot: string;
  mode: PersonSelectRawMatchMode;
  labelNames: PersonSelectRawLabelNames;
  rawMarkJobId: string;
  onStageChange?: (stage: "WRITING_XMP" | "COPYING_RAW") => void;
  onProgress?: (progress: {
    stage: "MARKING" | "COPYING";
    current: number;
    total: number;
    message: string;
  }) => void;
  dependencies?: Partial<ExecutionDependencies>;
}): Promise<PersonSelectRawMatchExecutionResult> {
  const runtime = { ...DEFAULT_DEPENDENCIES, ...input.dependencies };
  const matched: PersonSelectRawMatchExecutionResult["matched"] = [];
  const alreadyCopied: PersonSelectRawMatchExecutionResult["alreadyCopied"] = [];
  const missing: PersonSelectRawMatchExecutionResult["missing"] = [];
  const ambiguous: PersonSelectRawMatchExecutionResult["ambiguous"] = [];
  const timeMismatch: PersonSelectRawMatchExecutionResult["timeMismatch"] = [];
  const missingTime: PersonSelectRawMatchExecutionResult["missingTime"] = [];
  const conflicts: PersonSelectRawMatchExecutionResult["conflicts"] = [];
  const markedSidecars: PersonSelectRawMatchExecutionResult["markedSidecars"] = [];
  const markFailures: PersonSelectRawMatchExecutionResult["markFailures"] = [];
  const copyFailures: PersonSelectRawMatchExecutionResult["copyFailures"] = [];
  const reviewRequired: PersonSelectRawReviewItem[] = [];
  let ratingCount = 0;
  let colorCount = 0;
  let conflictCount = 0;
  let done = 0;

  const captureCache = new Map<string, Promise<CaptureTime | null>>();
  const captureFor = (filePath: string) => {
    let current = captureCache.get(filePath);
    if (!current) {
      current = runtime.readCaptureTime(filePath).catch(() => null);
      captureCache.set(filePath, current);
    }
    return current;
  };

  for (const choice of input.targets) {
    const name = choice.ownerName;
    const rawCandidates = input.rawIndex.get(personSelectRawBasename(choice.originalFileName)) ?? [];
    const jpgPath = safeSourceFile(input.jpgRoot, choice.sourceRelPath);
    const jpgCaptureTime = await captureFor(jpgPath);
    const candidateTimes = await Promise.all(
      rawCandidates.map((candidate) => captureFor(candidate.path)),
    );
    const resolved = resolveCaptureTimeCandidate({
      jpgCaptureTime,
      jpgRelativePath: choice.sourceRelPath,
      candidates: rawCandidates.map((candidate, index) => ({
        id: candidate.relPath,
        captureTime: candidateTimes[index],
        fileSize: candidate.size,
        relativePath: candidate.relPath,
      })),
    });
    const picked = resolved.confirmedCandidateId
      ? rawCandidates.find((candidate) => candidate.relPath === resolved.confirmedCandidateId) ?? null
      : null;

    if (!picked) {
      const candidates = rawCandidates.map((file) => file.relPath);
      const reason = resolved.status;
      if (reason === "raw_missing") missing.push({ name, jpg: choice.originalFileName });
      else if (reason === "multiple_candidates") {
        ambiguous.push({ name, jpg: choice.originalFileName, candidates });
      } else if (reason === "time_mismatch") {
        timeMismatch.push({ name, jpg: choice.originalFileName, candidates });
      } else if (reason === "missing_time") {
        missingTime.push({ name, jpg: choice.originalFileName, candidates });
      }
      reviewRequired.push({ owner: name, jpg: choice.originalFileName, reason, candidates });
    } else if (input.mode === "mark") {
      input.onStageChange?.("WRITING_XMP");
      const duplicateRaws = matchingDuplicateRaws(picked, rawCandidates, candidateTimes);
      if (choice.customerRating !== null) ratingCount += 1;
      if (choice.customerColorLabel !== null) colorCount += 1;
      if (choice.markConflict) conflictCount += 1;
      for (const raw of duplicateRaws) {
        try {
          markedSidecars.push(await runtime.markRawSidecar({
            raw,
            shootingRoot: input.shootingRoot,
            jobId: input.rawMarkJobId,
            rating: choice.customerRating,
            colorLabel: choice.customerColorLabel,
            labelNames: input.labelNames,
          }));
        } catch (error) {
          markFailures.push({
            raw: raw.relPath,
            error: error instanceof Error ? error.message : "XMP 기록 실패",
          });
        }
      }
    } else {
      input.onStageChange?.("COPYING_RAW");
      const targetDir = path.join(input.outputRoot, safeFolderName(name));
      try {
        await runtime.createDirectory(targetDir);
        const operation = await runtime.copyRaw({
          source: picked.path,
          destinationDirectory: targetDir,
          move: false,
        });
        if (operation.alreadyExisted) alreadyCopied.push({ name, raw: picked.name });
        else {
          matched.push({
            name,
            jpg: choice.originalFileName,
            raw: picked.relPath,
            attributeVerified: true,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "RAW 복사 실패";
        if (message.includes("같은 이름이 있어 덮어쓰지 않음")) {
          conflicts.push({ name, raw: picked.name });
          reviewRequired.push({
            owner: name,
            jpg: choice.originalFileName,
            reason: "conflict",
            candidates: [picked.relPath],
          });
        } else {
          copyFailures.push({
            stage: "raw_copy",
            name,
            jpg: choice.originalFileName,
            raw: picked.relPath,
            error: message,
          });
          reviewRequired.push({
            owner: name,
            jpg: choice.originalFileName,
            reason: "copy_failed",
            candidates: [picked.relPath],
            stage: "raw_copy",
            error: message,
          });
        }
      }
    }

    done += 1;
    input.onProgress?.({
      stage: input.mode === "mark" ? "MARKING" : "COPYING",
      current: done,
      total: input.targets.length,
      message: `${name} · ${choice.originalFileName}`,
    });
  }

  return {
    matched,
    alreadyCopied,
    missing,
    ambiguous,
    timeMismatch,
    missingTime,
    conflicts,
    markedSidecars,
    markFailures,
    copyFailures,
    reviewRequired,
    ratingCount,
    colorCount,
    conflictCount,
  };
}
