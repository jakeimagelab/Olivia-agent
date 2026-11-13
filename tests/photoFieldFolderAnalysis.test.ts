import { describe, expect, it, vi } from "vitest";
import { analyzeBrowserFieldFolder } from "@/lib/photo-classifier/fieldFolderAnalysis";
import type { FolderShootingPattern } from "@/lib/photo-classifier/pattern-analysis";

function pattern(name: string): FolderShootingPattern {
  return {
    shootingType: name,
    observations: ["테스트"],
    profile: {
      weights: {
        timeGapScore: 0.2,
        personChangeScore: 0.2,
        locationChangeScore: 0.2,
        equipmentChangeScore: 0.1,
        poseChangeScore: 0.1,
        sceneTypeChangeScore: 0.1,
        visualChangeScore: 0.05,
        shotDistanceChangeScore: 0.05,
      },
      splitThreshold: 0.72,
      reviewThreshold: 0.55,
      absoluteTimeGapMinutes: 4,
    },
  };
}

function fakeDirectory(files: Array<{ name: string; timestamp: number }>) {
  return {
    name: "촬영",
    async *entries() {
      for (const item of files) {
        yield [item.name, {
          kind: "file",
          getFile: async () => ({
            name: item.name,
            size: 100,
            lastModified: item.timestamp,
          } as File),
        } as unknown as FileSystemFileHandle] as [string, FileSystemHandle];
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("field folder analysis", () => {
  it("sorts JPG files by capture time and reuses a cached folder pattern", async () => {
    const cached = pattern("캐시");
    const requestPattern = vi.fn();
    const result = await analyzeBrowserFieldFolder({
      rootDirectory: fakeDirectory([
        { name: "B.JPG", timestamp: 2_000 },
        { name: "ignore.txt", timestamp: 500 },
        { name: "A.JPG", timestamp: 1_000 },
      ]),
      department: "ophthalmology",
      fallbackGapMinutes: 3,
      timestampReader: async (file) => ({
        timestamp: file.lastModified,
        source: "datetime_original",
      }),
      getPattern: async <T,>() => cached as T,
      requestPattern,
      proposalBuilder: async (entries, gapMinutes) => [{
        id: "cached",
        startIndex: 0,
        endIndex: 1,
        fileCount: entries.length,
        representativeFiles: [],
        reasons: [`${gapMinutes}분`],
      }],
    });

    expect(result.entries.map((entry) => entry.name)).toEqual(["A.JPG", "B.JPG"]);
    expect(result.pattern).toBe(cached);
    expect(result.fromCache).toBe(true);
    expect(result.proposals[0]).toMatchObject({ fileCount: 2, reasons: ["4분"] });
    expect(requestPattern).not.toHaveBeenCalled();
  });

  it("requests and stores a pattern when the folder fingerprint is not cached", async () => {
    const analyzed = pattern("새 분석");
    const setPattern = vi.fn().mockResolvedValue(undefined);
    const requestPattern = vi.fn().mockResolvedValue(analyzed);
    const result = await analyzeBrowserFieldFolder({
      rootDirectory: fakeDirectory([
        { name: "A.JPG", timestamp: 1_000 },
        { name: "B.jpeg", timestamp: 3_000 },
      ]),
      department: "dermatology",
      fallbackGapMinutes: 3,
      timestampReader: async (file) => ({ timestamp: file.lastModified, source: "datetime_original" }),
      getPattern: async <T,>() => null as T | null,
      setPattern,
      getFeature: async () => null,
      requestPattern,
      proposalBuilder: async () => [],
    });

    expect(result.fromCache).toBe(false);
    expect(result.pattern).toBe(analyzed);
    expect(requestPattern).toHaveBeenCalledWith("dermatology", expect.objectContaining({
      time: expect.objectContaining({ fileCount: 2 }),
      cameraModelCount: 1,
    }));
    expect(setPattern).toHaveBeenCalledWith(expect.any(String), analyzed);
  });
});
