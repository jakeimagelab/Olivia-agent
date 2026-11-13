import { describe, expect, it, vi } from "vitest";
import { extractBrowserFieldFeatures } from "@/lib/photo-classifier/fieldFeatureExtraction";
import type { LocalVisualFeatures } from "@/lib/photo-classifier/hybrid-types";

function feature(seed: number): LocalVisualFeatures {
  return {
    dHash: String(seed).repeat(64).slice(0, 64),
    colorHistogram: new Array(64).fill(seed),
    backgroundGrid: new Array(24).fill(seed),
    compositionGrid: new Array(16).fill(seed),
    brightness: seed,
  };
}

function entries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    file: { name: `IMG_${index}.JPG` } as File,
  }));
}

describe("field feature extraction", () => {
  it("reuses cached features, extracts only misses, and caches successful results", async () => {
    const first = feature(1);
    const second = feature(2);
    const setCached = vi.fn().mockResolvedValue(undefined);
    const progress = vi.fn();

    const result = await extractBrowserFieldFeatures({
      entries: entries(3),
      rootName: "촬영",
      concurrency: 2,
      makeCacheKey: (_rootName, file) => file.name,
      getCached: async (key) => key === "IMG_0.JPG" ? first : null,
      setCached,
      extractor: async ({ files, onProgress }) => {
        expect(files.map((file) => file.name)).toEqual(["IMG_1.JPG", "IMG_2.JPG"]);
        onProgress?.(1, 2);
        return [{ features: second }, { features: null, error: "damaged" }];
      },
      onProgress: progress,
    });

    expect(result).toEqual({
      features: [first, second, second],
      failedImages: 1,
      cachedImages: 1,
    });
    expect(setCached).toHaveBeenCalledWith("IMG_1.JPG", second);
    expect(progress).toHaveBeenCalledWith({
      completed: 2,
      total: 3,
      uncachedCompleted: 1,
      uncachedTotal: 2,
    });
  });

  it("supplies stable blank features when every extraction fails", async () => {
    const result = await extractBrowserFieldFeatures({
      entries: entries(2),
      rootName: "촬영",
      concurrency: 2,
      makeCacheKey: (_rootName, file) => file.name,
      getCached: async () => null,
      setCached: async () => undefined,
      extractor: async () => [
        { features: null, error: "bad image" },
        { features: null, error: "bad image" },
      ],
    });

    expect(result.failedImages).toBe(2);
    expect(result.features).toHaveLength(2);
    expect(result.features[0]).toMatchObject({ brightness: 0, dHash: "0".repeat(64) });
    expect(result.features[1]).toEqual(result.features[0]);
  });
});
