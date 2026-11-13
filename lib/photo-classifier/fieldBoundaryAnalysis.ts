import { buildCandidateSegments } from "./candidate-builder";
import { getApiThumb, getBoundaryApiImage } from "./browserProcessing";
import { withTimeout } from "./browserFileOps";
import type {
  HybridSceneType,
  SceneFrameAnalysis,
  TimestampedPhoto,
  VisualBoundaryCandidate,
} from "./hybrid-types";
import { buildPurposeSampleIndices, findPurposeTransitions } from "./purpose-scan";
import type { MedicalDepartment } from "./types";

type BrowserPhotoEntry = TimestampedPhoto & {
  file: File;
};

type PurposeScanFailure = {
  startIndex: number;
  endIndex: number;
  error: string;
};

type PurposeScanResponse = {
  ok?: boolean;
  error?: string;
  labels?: Array<{ index: number; purpose: HybridSceneType }>;
};

type BoundaryAnalysisResponse = {
  ok?: boolean;
  error?: string;
  analysis?: SceneFrameAnalysis;
};

export async function appendBrowserPurposeTransitionCandidates({
  entries,
  candidates,
  department,
  hardGapMinutes,
  signal,
  isCancelled = () => false,
  onProgress,
  fetchImpl = fetch,
  thumbnailLoader = getApiThumb,
  timeoutMs = 60_000,
}: {
  entries: readonly BrowserPhotoEntry[];
  candidates: readonly VisualBoundaryCandidate[];
  department: MedicalDepartment;
  hardGapMinutes: number;
  signal?: AbortSignal;
  isCancelled?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
  fetchImpl?: typeof fetch;
  thumbnailLoader?: (file: File) => Promise<string>;
  timeoutMs?: number;
}): Promise<{ candidates: VisualBoundaryCandidate[]; failures: PurposeScanFailure[] }> {
  const nextCandidates = [...candidates];
  const existingBoundaryIndexes = new Set(nextCandidates.map((candidate) => candidate.boundaryIndex));
  const segments = buildCandidateSegments([...entries], hardGapMinutes);
  const failures: PurposeScanFailure[] = [];
  let completed = 0;

  for (const segment of segments) {
    completed += 1;
    const segmentLength = segment.endIndex - segment.startIndex + 1;
    if (segmentLength < 8 || isCancelled() || signal?.aborted) continue;
    onProgress?.(completed, segments.length);
    try {
      const images = await Promise.all(buildPurposeSampleIndices(segmentLength).map(async (localIndex) => {
        const entry = entries[segment.startIndex + localIndex];
        return {
          fileName: entry.name,
          base64: await thumbnailLoader(entry.file),
          index: localIndex,
        };
      }));
      const response = await withTimeout(fetchImpl("/api/photo-scene-purpose-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department, images }),
        signal,
      }), timeoutMs, "AI 목적 스캔");
      const data = await response.json() as PurposeScanResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? `AI 목적 스캔 실패 (${response.status})`);
      }
      for (const localTransition of findPurposeTransitions(data.labels ?? [])) {
        const boundaryIndex = segment.startIndex + localTransition;
        if (boundaryIndex <= 0 || boundaryIndex >= entries.length || existingBoundaryIndexes.has(boundaryIndex)) continue;
        existingBoundaryIndexes.add(boundaryIndex);
        nextCandidates.push({
          boundaryIndex,
          timeGapMs: Math.max(0, entries[boundaryIndex].mtime - entries[boundaryIndex - 1].mtime),
          visualChangeScore: 0,
          hardGap: false,
          requiresAi: true,
        });
      }
    } catch (error) {
      failures.push({
        startIndex: segment.startIndex,
        endIndex: segment.endIndex,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  nextCandidates.sort((left, right) => left.boundaryIndex - right.boundaryIndex);
  return { candidates: nextCandidates, failures };
}

export async function analyzeBrowserSceneBoundary({
  entries,
  boundaryIndex,
  windowSize,
  useHighModel,
  department,
  signal,
  fetchImpl = fetch,
  imageLoader = getBoundaryApiImage,
  timeoutMs = 60_000,
  retryDelayMs = 500,
}: {
  entries: readonly BrowserPhotoEntry[];
  boundaryIndex: number;
  windowSize: number;
  useHighModel: boolean;
  department: MedicalDepartment;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  imageLoader?: (file: File) => Promise<string>;
  timeoutMs?: number;
  retryDelayMs?: number;
}): Promise<SceneFrameAnalysis> {
  const beforeEntries = entries.slice(Math.max(0, boundaryIndex - windowSize), boundaryIndex);
  const afterEntries = entries.slice(boundaryIndex, Math.min(entries.length, boundaryIndex + windowSize));
  const [before, after] = await Promise.all([
    Promise.all(beforeEntries.map(async (entry) => ({ fileName: entry.name, base64: await imageLoader(entry.file) }))),
    Promise.all(afterEntries.map(async (entry) => ({ fileName: entry.name, base64: await imageLoader(entry.file) }))),
  ]);
  let lastError = "AI 경계 분석 실패";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await withTimeout(fetchImpl("/api/photo-scene-boundary-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department,
          boundaryIndex,
          before,
          after,
          timeGapSeconds: (entries[boundaryIndex]?.mtime - entries[boundaryIndex - 1]?.mtime) / 1_000,
          options: { useHighModel },
        }),
        signal,
      }), timeoutMs, "AI 경계 분석");
      const data = await response.json() as BoundaryAnalysisResponse;
      if (response.ok && data.ok && data.analysis) return data.analysis;
      lastError = data.error ?? lastError;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt === 0 && !signal?.aborted && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(lastError);
}
