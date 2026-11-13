import { mkdir } from "node:fs/promises";

import {
  type PersonSelectRawLabelNames,
  type PersonSelectRawMatchMode,
  type PersonSelectRawMatchTarget,
} from "@/lib/person-select/rawMatch";
import { markPersonSelectRawSidecar } from "@/lib/person-select/node/rawMarkFileOperations";
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
import {
  copyResolvedPersonSelectRaw,
  createPersonSelectRawMatchExecutionResult,
  markResolvedPersonSelectRaw,
  recordUnmatchedPersonSelectRaw,
  type PersonSelectRawMatchExecutionDependencies,
  type PersonSelectRawMatchExecutionResult,
} from "@/lib/person-select/node/rawMatchOperations";

export type {
  PersonSelectRawMatchExecutionResult,
  PersonSelectRawReviewItem,
} from "@/lib/person-select/node/rawMatchOperations";

type ExecutionDependencies = PersonSelectRawMatchExecutionDependencies & {
  readCaptureTime: (filePath: string) => Promise<CaptureTime | null>;
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
  const result = createPersonSelectRawMatchExecutionResult();
  const captureFor = createPersonSelectCaptureTimeCache(runtime.readCaptureTime);

  for (const [index, choice] of input.targets.entries()) {
    const rawCandidates = input.rawIndex.get(personSelectRawBasename(choice.originalFileName)) ?? [];
    const resolution = await resolvePersonSelectRawCandidate({
      choice,
      rawCandidates,
      jpgRoot: input.jpgRoot,
      captureFor,
    });

    if (!resolution.picked) {
      recordUnmatchedPersonSelectRaw(result, choice, resolution);
    } else if (input.mode === "mark") {
      input.onStageChange?.("WRITING_XMP");
      await markResolvedPersonSelectRaw({
        result,
        choice,
        duplicateRaws: resolution.duplicateRaws,
        shootingRoot: input.shootingRoot,
        rawMarkJobId: input.rawMarkJobId,
        labelNames: input.labelNames,
        markRawSidecar: runtime.markRawSidecar,
      });
    } else {
      input.onStageChange?.("COPYING_RAW");
      await copyResolvedPersonSelectRaw({
        result,
        choice,
        picked: resolution.picked,
        outputRoot: input.outputRoot,
        createDirectory: runtime.createDirectory,
        copyRaw: runtime.copyRaw,
      });
    }

    input.onProgress?.({
      stage: input.mode === "mark" ? "MARKING" : "COPYING",
      current: index + 1,
      total: input.targets.length,
      message: `${choice.ownerName} · ${choice.originalFileName}`,
    });
  }

  return result;
}
