import path from "node:path";

import type {
  PersonSelectRawLabelNames,
  PersonSelectRawMatchTarget,
} from "@/lib/person-select/rawMatch";
import type {
  PersonSelectRawMarkFile,
} from "@/lib/person-select/node/rawMarkFileOperations";
import type { PersonSelectRawFile } from "@/lib/person-select/node/rawFileIndex";
import type { PersonSelectRawCandidateResolution } from "@/lib/person-select/node/rawMatchCandidateResolution";
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

export type PersonSelectRawMatchExecutionDependencies = {
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

export function createPersonSelectRawMatchExecutionResult(): PersonSelectRawMatchExecutionResult {
  return {
    matched: [],
    alreadyCopied: [],
    missing: [],
    ambiguous: [],
    timeMismatch: [],
    missingTime: [],
    conflicts: [],
    markedSidecars: [],
    markFailures: [],
    copyFailures: [],
    reviewRequired: [],
    ratingCount: 0,
    colorCount: 0,
    conflictCount: 0,
  };
}

export function recordUnmatchedPersonSelectRaw(
  result: PersonSelectRawMatchExecutionResult,
  choice: PersonSelectRawMatchTarget,
  resolution: PersonSelectRawCandidateResolution,
) {
  const name = choice.ownerName;
  const candidates = resolution.candidatePaths;
  const reason = resolution.status;
  if (reason === "raw_missing") result.missing.push({ name, jpg: choice.originalFileName });
  else if (reason === "multiple_candidates") {
    result.ambiguous.push({ name, jpg: choice.originalFileName, candidates });
  } else if (reason === "time_mismatch") {
    result.timeMismatch.push({ name, jpg: choice.originalFileName, candidates });
  } else if (reason === "missing_time") {
    result.missingTime.push({ name, jpg: choice.originalFileName, candidates });
  }
  result.reviewRequired.push({ owner: name, jpg: choice.originalFileName, reason, candidates });
}

export async function markResolvedPersonSelectRaw({
  result,
  choice,
  duplicateRaws,
  shootingRoot,
  rawMarkJobId,
  labelNames,
  markRawSidecar,
}: {
  result: PersonSelectRawMatchExecutionResult;
  choice: PersonSelectRawMatchTarget;
  duplicateRaws: readonly PersonSelectRawFile[];
  shootingRoot: string;
  rawMarkJobId: string;
  labelNames: PersonSelectRawLabelNames;
  markRawSidecar: PersonSelectRawMatchExecutionDependencies["markRawSidecar"];
}) {
  if (choice.customerRating !== null) result.ratingCount += 1;
  if (choice.customerColorLabel !== null) result.colorCount += 1;
  if (choice.markConflict) result.conflictCount += 1;
  for (const raw of duplicateRaws) {
    try {
      result.markedSidecars.push(await markRawSidecar({
        raw,
        shootingRoot,
        jobId: rawMarkJobId,
        rating: choice.customerRating,
        colorLabel: choice.customerColorLabel,
        labelNames,
      }));
    } catch (error) {
      result.markFailures.push({
        raw: raw.relPath,
        error: error instanceof Error ? error.message : "XMP 기록 실패",
      });
    }
  }
}

export async function copyResolvedPersonSelectRaw({
  result,
  choice,
  picked,
  outputRoot,
  createDirectory,
  copyRaw,
}: {
  result: PersonSelectRawMatchExecutionResult;
  choice: PersonSelectRawMatchTarget;
  picked: PersonSelectRawFile;
  outputRoot: string;
  createDirectory: PersonSelectRawMatchExecutionDependencies["createDirectory"];
  copyRaw: PersonSelectRawMatchExecutionDependencies["copyRaw"];
}) {
  const name = choice.ownerName;
  const targetDir = path.join(outputRoot, normalizePersonSelectOutputFolderName(name));
  try {
    await createDirectory(targetDir);
    const operation = await copyRaw({
      source: picked.path,
      destinationDirectory: targetDir,
      move: false,
    });
    if (operation.alreadyExisted) result.alreadyCopied.push({ name, raw: picked.name });
    else {
      result.matched.push({
        name,
        jpg: choice.originalFileName,
        raw: picked.relPath,
        attributeVerified: true,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAW 복사 실패";
    if (message.includes("같은 이름이 있어 덮어쓰지 않음")) {
      result.conflicts.push({ name, raw: picked.name });
      result.reviewRequired.push({
        owner: name,
        jpg: choice.originalFileName,
        reason: "conflict",
        candidates: [picked.relPath],
      });
      return;
    }
    result.copyFailures.push({
      stage: "raw_copy",
      name,
      jpg: choice.originalFileName,
      raw: picked.relPath,
      error: message,
    });
    result.reviewRequired.push({
      owner: name,
      jpg: choice.originalFileName,
      reason: "copy_failed",
      candidates: [picked.relPath],
      stage: "raw_copy",
      error: message,
    });
  }
}
