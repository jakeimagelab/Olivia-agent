import type { RawIndex, RawIndexEntry } from "@/lib/selectMatch/rawIndex";
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

export function resolveCaptureTimeCandidate(input: {
  jpgCaptureTime: CaptureTime | null;
  candidates: Array<{ id: string; captureTime: CaptureTime | null }>;
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
  if (withinTolerance.length === 1) {
    return { status: "confirmed", confirmedCandidateId: withinTolerance[0].id, differences };
  }

  // 양쪽에 소수초가 있을 때만 가장 가까운 후보를 안전하게 유일 후보로 좁힌다.
  const canUseSubseconds = input.jpgCaptureTime.hasSubseconds
    && withinTolerance.every((candidate) => candidate.captureTime?.hasSubseconds);
  if (canUseSubseconds) {
    const minimum = Math.min(...withinTolerance.map((candidate) => candidate.difference));
    const closest = withinTolerance.filter((candidate) => candidate.difference === minimum);
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
  const rawTimeCache = new Map<string, Promise<CaptureTime | null>>();
  let completed = 0;
  const items = await mapWithConcurrency(input.jpgSources, concurrency, async (jpg) => {
    const basename = jpg.basename.normalize("NFC").toLocaleLowerCase("en-US");
    const rawEntries = input.rawIndex.get(basename) ?? [];
    const jpgCaptureTime = await limitRead(() => jpg.handle.getFile().then(readJpgCaptureTime)).catch(() => null);
    const candidateTimes = await Promise.all(rawEntries.map(async (entry) => {
      let promise = rawTimeCache.get(entry.relativePath);
      if (!promise) {
        promise = limitRead(() => entry.fileHandle.getFile().then(readRawCaptureTime)).catch(() => null);
        rawTimeCache.set(entry.relativePath, promise);
      }
      return promise;
    }));
    const candidates = rawEntries.map((entry, index) => ({
      id: `${entry.relativePath}::candidate-${index}`,
      entry,
      captureTime: candidateTimes[index],
    }));
    const resolved = resolveCaptureTimeCandidate({ jpgCaptureTime, candidates });
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
