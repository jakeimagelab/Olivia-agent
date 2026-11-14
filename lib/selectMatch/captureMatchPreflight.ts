import { readJpgCaptureTime, readRawCaptureTime, type CaptureTime } from "@/lib/selectMatch/captureTime";
import { resolveCaptureTimeCandidate } from "@/lib/selectMatch/captureMatchResolution";
import type {
  CaptureMatchDecision,
  CaptureMatchPreflight,
  CaptureMatchStatus,
  JpgMatchSource,
} from "@/lib/selectMatch/captureMatchTypes";
import type { RawIndex } from "@/lib/selectMatch/rawIndex";

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
