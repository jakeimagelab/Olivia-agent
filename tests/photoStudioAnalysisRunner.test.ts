import { describe, expect, it } from "vitest";
import { runStudioAnalysisConcurrently } from "@/lib/photo-classifier/studioAnalysisRunner";

describe("runStudioAnalysisConcurrently", () => {
  it("limits concurrency and preserves result order", async () => {
    let active = 0;
    let maximumActive = 0;
    const result = await runStudioAnalysisConcurrently({
      items: [1, 2, 3, 4, 5],
      concurrency: 2,
      analyze: async (item) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 6 - item));
        active -= 1;
        return item * 10;
      },
      recover: (_error, item) => item,
    });

    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("only analyzes the requested indices", async () => {
    const result = await runStudioAnalysisConcurrently({
      items: ["keep", "first", "keep-too", "second"],
      targetIndices: [1, 3],
      concurrency: 4,
      analyze: async (item) => item.toUpperCase(),
      recover: (_error, item) => item,
    });

    expect(result).toEqual(["keep", "FIRST", "keep-too", "SECOND"]);
  });

  it("recovers failed items without stopping progress", async () => {
    const progress: number[] = [];
    const result = await runStudioAnalysisConcurrently({
      items: [1, 2, 3],
      concurrency: 2,
      analyze: async (item) => {
        if (item === 2) throw new Error("failed");
        return item * 2;
      },
      recover: (_error, item) => -item,
      onProgress: ({ completed }) => progress.push(completed),
    });

    expect(result).toEqual([2, -2, 6]);
    expect(progress).toHaveLength(3);
    expect(Math.max(...progress)).toBe(3);
  });

  it("returns immediately when there are no targets", async () => {
    const result = await runStudioAnalysisConcurrently({
      items: [1, 2],
      targetIndices: [],
      concurrency: 8,
      analyze: async (item) => item * 2,
      recover: (_error, item) => item,
    });

    expect(result).toEqual([1, 2]);
  });
});
