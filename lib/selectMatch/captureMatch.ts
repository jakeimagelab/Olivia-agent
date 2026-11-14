import type { RawIndex, RawIndexEntry } from "@/lib/selectMatch/rawIndex";
import { isInsideDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";
import {
  normalizePhotoToolFileKey,
  normalizePhotoToolSelectionKey,
} from "@/lib/photo-bridge/toolLinkage";
import {
  formatCaptureTime,
  readJpgCaptureTime,
  readRawCaptureTime,
  type CaptureTime,
} from "@/lib/selectMatch/captureTime";

export type CaptureMatchStatus = "confirmed" | "time_mismatch" | "multiple_candidates" | "missing_time" | "raw_missing";

export type JpgMatchSource = {
  id: string;
  name: string;
  basename: string;
  relativePath: string;
  handle: FileSystemFileHandle;
  thumbUrl: string | null;
};

export type RawMatchCandidate = {
  id: string;
  entry: RawIndexEntry;
  captureTime: CaptureTime | null;
  fileSize: number;
  differenceMs: number | null;
};

export type CaptureMatchDecision = {
  id: string;
  jpg: JpgMatchSource;
  jpgCaptureTime: CaptureTime | null;
  candidates: RawMatchCandidate[];
  status: CaptureMatchStatus;
  confirmedCandidateId: string | null;
};

export type CaptureMatchPreflight = {
  items: CaptureMatchDecision[];
  rawFound: number;
  confirmed: number;
  timeMismatch: number;
  multipleCandidates: number;
  missingTime: number;
  rawMissing: number;
};

/**
 * 기준 결과에 포함된 JPG만 사전 확인으로 넘긴다.
 * 같은 basename이어도 상대경로가 다르면 서로 다른 JPG로 유지하고, 이전 N차보정본만 제외한다.
 */
export function resolveCaptureMatchJpgSources(input: {
  targetBasenames: ReadonlySet<string>;
  sources: readonly JpgMatchSource[];
}): JpgMatchSource[] {
  const exactTargets = new Set(Array.from(input.targetBasenames)
    .filter((target) => /[\\/]/u.test(target))
    .map(normalizePhotoToolSelectionKey)
    .filter(Boolean));
  const legacyBasenames = new Set(Array.from(input.targetBasenames)
    .filter((target) => !/[\\/]/u.test(target))
    .map(normalizePhotoToolFileKey)
    .filter(Boolean));
  const seenPaths = new Set<string>();
  const output: JpgMatchSource[] = [];
  for (const source of input.sources) {
    const basename = normalizePhotoToolFileKey(source.basename);
    const pathKey = normalizePhotoToolSelectionKey(source.relativePath);
    if (!exactTargets.has(pathKey) && !legacyBasenames.has(basename)) continue;
    if (isInsideDeliveredRoundFolder(source.relativePath)) continue;
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);
    output.push(source);
  }
  return output;
}

export function captureMatchSummaryTotal(preflight: CaptureMatchPreflight): number {
  return preflight.confirmed
    + preflight.timeMismatch
    + preflight.multipleCandidates
    + preflight.missingTime
    + preflight.rawMissing;
}

/** 실행 전에 기준 결과, JPG 항목 수, 상태별 합계가 모두 같은지 확인한다. */
export function isCaptureMatchTargetCountConsistent(
  expectedTargetCount: number,
  preflight: CaptureMatchPreflight,
): boolean {
  return preflight.items.length === expectedTargetCount
    && captureMatchSummaryTotal(preflight) === expectedTargetCount;
}

function parentFolderName(relativePath: string | undefined): string {
  if (!relativePath) return "";
  const segments = relativePath.normalize("NFC").split(/[\\/]+/u).filter(Boolean);
  return (segments.at(-2) ?? "").toLocaleLowerCase("en-US");
}

function duplicateRepresentative<T extends {
  id: string;
  captureTime: CaptureTime | null;
  fileSize?: number;
  relativePath?: string;
}>(candidates: readonly T[], jpgRelativePath: string | undefined): T {
  const jpgFolder = parentFolderName(jpgRelativePath);
  return candidates.find((candidate) => jpgFolder && parentFolderName(candidate.relativePath) === jpgFolder)
    ?? candidates[0];
}

export function resolveCaptureTimeCandidate(input: {
  jpgCaptureTime: CaptureTime | null;
  jpgRelativePath?: string;
  candidates: Array<{
    id: string;
    captureTime: CaptureTime | null;
    fileSize?: number;
    relativePath?: string;
  }>;
  toleranceMs?: number;
}): { status: CaptureMatchStatus; confirmedCandidateId: string | null; differences: Map<string, number | null> } {
  const toleranceMs = input.toleranceMs ?? 2000;
  const differences = new Map<string, number | null>();
  if (!input.candidates.length) return { status: "raw_missing", confirmedCandidateId: null, differences };

  if (!input.jpgCaptureTime || input.candidates.some((candidate) => !candidate.captureTime)) {
    for (const candidate of input.candidates) differences.set(candidate.id, null);
    return { status: "missing_time", confirmedCandidateId: null, differences };
  }

  const withinTolerance = input.candidates.flatMap((candidate) => {
    const captureTime = candidate.captureTime!;
    const difference = Math.abs(input.jpgCaptureTime!.timestampMs - captureTime.timestampMs);
    differences.set(candidate.id, difference);
    return difference <= toleranceMs ? [{ ...candidate, difference }] : [];
  });
  if (!withinTolerance.length) return { status: "time_mismatch", confirmedCandidateId: null, differences };

  // 촬영시각(SubSec 포함)과 파일 크기가 모두 같은 RAW는 여러 폴더에 복사된 동일 파일이다.
  // 동일 파일 묶음 안에서는 JPG와 같은 이름의 부모 폴더를 우선하고, 없으면 발견 순서를 쓴다.
  const duplicateGroups = new Map<string, typeof withinTolerance>();
  for (const candidate of withinTolerance) {
    const key = typeof candidate.fileSize === "number"
      ? `${candidate.captureTime!.timestampMs}:${candidate.fileSize}`
      : `unique:${candidate.id}`;
    const group = duplicateGroups.get(key) ?? [];
    group.push(candidate);
    duplicateGroups.set(key, group);
  }
  const distinctCandidates = Array.from(duplicateGroups.values(), (group) => (
    duplicateRepresentative(group, input.jpgRelativePath)
  ));

  if (distinctCandidates.length === 1) {
    return { status: "confirmed", confirmedCandidateId: distinctCandidates[0].id, differences };
  }

  // 양쪽에 소수초가 있을 때만 가장 가까운 후보를 안전하게 유일 후보로 좁힌다.
  const canUseSubseconds = input.jpgCaptureTime.hasSubseconds
    && distinctCandidates.every((candidate) => candidate.captureTime?.hasSubseconds);
  if (canUseSubseconds) {
    const minimum = Math.min(...distinctCandidates.map((candidate) => candidate.difference));
    const closest = distinctCandidates.filter((candidate) => candidate.difference === minimum);
    if (closest.length === 1) {
      return { status: "confirmed", confirmedCandidateId: closest[0].id, differences };
    }
  }
  return { status: "multiple_candidates", confirmedCandidateId: null, differences };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function createAsyncLimiter(concurrency: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active += 1;
        void task().then(resolve, reject).finally(() => {
          active -= 1;
          waiting.shift()?.();
        });
      };
      if (active < concurrency) run();
      else waiting.push(run);
    });
  };
}

export async function buildCaptureMatchPreflight(input: {
  jpgSources: readonly JpgMatchSource[];
  rawIndex: RawIndex;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}): Promise<CaptureMatchPreflight> {
  const concurrency = Math.max(1, input.concurrency ?? 8);
  const limitRead = createAsyncLimiter(concurrency);
  const rawMetadataCache = new Map<string, Promise<{ captureTime: CaptureTime | null; fileSize: number }>>();
  let completed = 0;
  const items = await mapWithConcurrency(input.jpgSources, concurrency, async (jpg) => {
    const basename = jpg.basename.normalize("NFC").toLocaleLowerCase("en-US");
    const rawEntries = input.rawIndex.get(basename) ?? [];
    const jpgCaptureTime = await limitRead(() => jpg.handle.getFile().then(readJpgCaptureTime)).catch(() => null);
    const candidateMetadata = await Promise.all(rawEntries.map(async (entry) => {
      let promise = rawMetadataCache.get(entry.relativePath);
      if (!promise) {
        promise = limitRead(async () => {
          const file = await entry.fileHandle.getFile();
          return { captureTime: await readRawCaptureTime(file), fileSize: file.size };
        }).catch(() => ({ captureTime: null, fileSize: -1 }));
        rawMetadataCache.set(entry.relativePath, promise);
      }
      return promise;
    }));
    const candidates = rawEntries.map((entry, index) => ({
      id: `${entry.relativePath}::candidate-${index}`,
      entry,
      captureTime: candidateMetadata[index].captureTime,
      fileSize: candidateMetadata[index].fileSize,
      relativePath: entry.relativePath,
    }));
    const resolved = resolveCaptureTimeCandidate({
      jpgCaptureTime,
      jpgRelativePath: jpg.relativePath,
      candidates,
    });
    completed += 1;
    input.onProgress?.(completed, input.jpgSources.length);
    return {
      id: jpg.id,
      jpg,
      jpgCaptureTime,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        differenceMs: resolved.differences.get(candidate.id) ?? null,
      })),
      status: resolved.status,
      confirmedCandidateId: resolved.confirmedCandidateId,
    } satisfies CaptureMatchDecision;
  });

  const count = (status: CaptureMatchStatus) => items.filter((item) => item.status === status).length;
  return {
    items,
    rawFound: Array.from(input.rawIndex.values()).reduce((sum, entries) => sum + entries.length, 0),
    confirmed: count("confirmed"),
    timeMismatch: count("time_mismatch"),
    multipleCandidates: count("multiple_candidates"),
    missingTime: count("missing_time"),
    rawMissing: count("raw_missing"),
  };
}

export type MatchLogResult = "확정" | "수동선택" | "건너뜀";

export type MatchLogRow = {
  jpgName: string;
  jpgPath: string;
  jpgCaptureTime: CaptureTime | null;
  rawPath: string;
  rawCaptureTime: CaptureTime | null;
  rawCaptureTimeText?: string;
  result: MatchLogResult;
};

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildMatchLogCsv(rows: readonly MatchLogRow[]): string {
  const header = ["JPG 이름", "JPG 경로", "JPG 촬영시각", "RAW 경로", "RAW 촬영시각", "결과"];
  return `\uFEFF${[
    header,
    ...rows.map((row) => [
      row.jpgName,
      row.jpgPath,
      formatCaptureTime(row.jpgCaptureTime),
      row.rawPath,
      row.rawCaptureTimeText ?? formatCaptureTime(row.rawCaptureTime),
      row.result,
    ]),
  ].map((columns) => columns.map(csvCell).join(",")).join("\r\n")}`;
}
