import { open } from "node:fs/promises";

import type { PersonSelectRawMatchTarget } from "@/lib/person-select/rawMatch";
import type { PersonSelectRawFile } from "@/lib/person-select/node/rawFileIndex";
import { resolveCaptureTimeCandidate, type CaptureMatchStatus } from "@/lib/selectMatch/captureMatch";
import { parseCaptureTime, type CaptureTime } from "@/lib/selectMatch/captureTime";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/node/rawMatchPaths";

export type PersonSelectRawCandidateResolution = {
  status: CaptureMatchStatus;
  picked: PersonSelectRawFile | null;
  duplicateRaws: PersonSelectRawFile[];
  candidatePaths: string[];
};

export async function readPersonSelectCaptureTime(filePath: string): Promise<CaptureTime | null> {
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

export function createPersonSelectCaptureTimeCache(
  readCaptureTime: (filePath: string) => Promise<CaptureTime | null>,
) {
  const cache = new Map<string, Promise<CaptureTime | null>>();
  return (filePath: string) => {
    let current = cache.get(filePath);
    if (!current) {
      current = readCaptureTime(filePath).catch(() => null);
      cache.set(filePath, current);
    }
    return current;
  };
}

function matchingDuplicateRaws(
  picked: PersonSelectRawFile,
  rawCandidates: readonly PersonSelectRawFile[],
  candidateTimes: readonly (CaptureTime | null)[],
) {
  const pickedIndex = rawCandidates.findIndex((candidate) => candidate.relPath === picked.relPath);
  const pickedTime = candidateTimes[pickedIndex];
  if (!pickedTime) return [picked];
  return rawCandidates.filter((candidate, index) => (
    candidate.size === picked.size
    && candidateTimes[index]?.timestampMs === pickedTime.timestampMs
  ));
}

export async function resolvePersonSelectRawCandidate(input: {
  choice: PersonSelectRawMatchTarget;
  rawCandidates: readonly PersonSelectRawFile[];
  jpgRoot: string;
  captureFor: (filePath: string) => Promise<CaptureTime | null>;
}): Promise<PersonSelectRawCandidateResolution> {
  const jpgPath = resolvePersonSelectSourcePath(input.jpgRoot, input.choice.sourceRelPath);
  const jpgCaptureTime = await input.captureFor(jpgPath);
  const candidateTimes = await Promise.all(
    input.rawCandidates.map((candidate) => input.captureFor(candidate.path)),
  );
  const resolved = resolveCaptureTimeCandidate({
    jpgCaptureTime,
    jpgRelativePath: input.choice.sourceRelPath,
    candidates: input.rawCandidates.map((candidate, index) => ({
      id: candidate.relPath,
      captureTime: candidateTimes[index],
      fileSize: candidate.size,
      relativePath: candidate.relPath,
    })),
  });
  const picked = resolved.confirmedCandidateId
    ? input.rawCandidates.find((candidate) => candidate.relPath === resolved.confirmedCandidateId) ?? null
    : null;
  return {
    status: resolved.status,
    picked,
    duplicateRaws: picked
      ? matchingDuplicateRaws(picked, input.rawCandidates, candidateTimes)
      : [],
    candidatePaths: input.rawCandidates.map((file) => file.relPath),
  };
}
