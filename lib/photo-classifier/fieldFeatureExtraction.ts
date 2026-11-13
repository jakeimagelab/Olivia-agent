import { extractFeaturesWithWorkers } from "./feature-worker-client";
import type { LocalVisualFeatures } from "./hybrid-types";
import {
  featureCacheKey,
  getCachedFeature,
  setCachedFeature,
} from "./scene-cache";

const BLANK_FEATURE: LocalVisualFeatures = {
  dHash: "0".repeat(64),
  colorHistogram: new Array(64).fill(0),
  backgroundGrid: new Array(24).fill(0),
  compositionGrid: new Array(16).fill(0),
  brightness: 0,
};

export async function extractBrowserFieldFeatures({
  entries,
  rootName,
  concurrency,
  signal,
  onProgress,
  extractor = extractFeaturesWithWorkers,
  getCached = getCachedFeature,
  setCached = setCachedFeature,
  makeCacheKey = featureCacheKey,
}: {
  entries: readonly { file: File }[];
  rootName: string;
  concurrency: number;
  signal?: AbortSignal;
  onProgress?: (progress: {
    completed: number;
    total: number;
    uncachedCompleted: number;
    uncachedTotal: number;
  }) => void;
  extractor?: typeof extractFeaturesWithWorkers;
  getCached?: (key: string) => Promise<LocalVisualFeatures | null>;
  setCached?: (key: string, features: LocalVisualFeatures) => Promise<void>;
  makeCacheKey?: (rootName: string, file: File) => string;
}): Promise<{
  features: LocalVisualFeatures[];
  failedImages: number;
  cachedImages: number;
}> {
  const cacheKeys = entries.map((entry) => makeCacheKey(rootName, entry.file));
  const cached = await Promise.all(cacheKeys.map((key) => getCached(key)));
  const cachedImages = cached.filter(Boolean).length;
  const missingIndices = cached.flatMap((feature, index) => feature ? [] : [index]);
  const missingFiles = missingIndices.map((index) => entries[index].file);
  const extracted = await extractor({
    files: missingFiles,
    concurrency,
    signal,
    onProgress: (completed) => onProgress?.({
      completed: cachedImages + completed,
      total: entries.length,
      uncachedCompleted: completed,
      uncachedTotal: missingFiles.length,
    }),
  });
  const features = [...cached] as Array<LocalVisualFeatures | null>;
  await Promise.all(extracted.map(async (result, offset) => {
    const originalIndex = missingIndices[offset];
    features[originalIndex] = result.features;
    if (result.features) await setCached(cacheKeys[originalIndex], result.features);
  }));
  const firstValid = features.find((feature): feature is LocalVisualFeatures => Boolean(feature)) ?? BLANK_FEATURE;
  const safeFeatures = features.map((feature, index) => feature ?? features[index - 1] ?? firstValid);
  return {
    features: safeFeatures,
    failedImages: extracted.filter((result) => !result.features).length,
    cachedImages,
  };
}
