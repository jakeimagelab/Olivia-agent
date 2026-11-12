import { describe, expect, it } from "vitest";

import {
  buildQuickProposals,
  mapWithConcurrency,
} from "@/lib/photo-classifier/browserProcessing";

describe("photo browser processing", () => {
  it("builds quick proposals from time gaps and keeps the established limit", async () => {
    const file = {} as File;
    const entries = Array.from({ length: 30 }, (_, index) => ({
      name: `IMG_${index}.JPG`,
      mtime: index * 10 * 60 * 1000,
      file,
    }));
    const proposals = await buildQuickProposals(entries, 3, async (_, size) => `thumb-${size}`);

    expect(proposals).toHaveLength(24);
    expect(proposals[0]).toMatchObject({
      id: "quick-0",
      fileCount: 1,
      representativeFiles: ["thumb-80"],
      reasons: ["시간 간격 기준(예상)"],
    });
  });

  it("keeps result order while respecting the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([30, 5, 20, 1], 2, async (delay, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return index;
    });

    expect(result).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });
});
