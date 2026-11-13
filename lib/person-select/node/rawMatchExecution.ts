import path from "node:path";
import { mkdir } from "node:fs/promises";

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
import type { CaptureTime } from "@/lib/selectMatch/captureTime";
import { copyOrMovePreservingMetadata } from "@/lib/selectMatch/node/rawMatchCopy";
import {
  createPersonSelectCaptureTimeCache,
  readPersonSelectCaptureTime,
  resolvePersonSelectRawCandidate,
} from "@/lib/person-select/node/rawMatchCandidateResolution";
import { normalizePersonSelectOutputFolderName } from "@/lib/person-select/node/rawMatchPaths";

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

const DEFAULT_DEPENDENCIES: ExecutionDependencies = {
  readCaptureTime: readPersonSelectCaptureTime,
  createDirectory: (directory) => mkdir(directory, { recursive: true }),
  copyRaw: (input) => copyOrMovePreservingMetadata(input),
  markRawSidecar: markPersonSelectRawSidecar,
};

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

  const captureFor = createPersonSelectCaptureTimeCache(runtime.readCaptureTime);

  for (const choice of input.targets) {
    const name = choice.ownerName;
    const rawCandidates = input.rawIndex.get(personSelectRawBasename(choice.originalFileName)) ?? [];
    const resolution = await resolvePersonSelectRawCandidate({
      choice,
      rawCandidates,
      jpgRoot: input.jpgRoot,
      captureFor,
    });
    const picked = resolution.picked;

    if (!picked) {
      const candidates = resolution.candidatePaths;
      const reason = resolution.status;
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
      if (choice.customerRating !== null) ratingCount += 1;
      if (choice.customerColorLabel !== null) colorCount += 1;
      if (choice.markConflict) conflictCount += 1;
      for (const raw of resolution.duplicateRaws) {
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
      const targetDir = path.join(input.outputRoot, normalizePersonSelectOutputFolderName(name));
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
