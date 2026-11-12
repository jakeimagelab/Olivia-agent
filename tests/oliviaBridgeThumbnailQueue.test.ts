import { describe, expect, it } from "vitest";
import { createBridgeThumbnailTaskQueue } from "@/lib/photo-bridge/thumbnailCache";

describe("Olivia Bridge thumbnail queue", () => {
  it("limits concurrent image decodes without dropping queued work", async () => {
    const queue = createBridgeThumbnailTaskQueue(3);
    let active = 0;
    let peak = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const jobs = Array.from({ length: 8 }, (_, index) => queue.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate;
      active -= 1;
      return index;
    }));

    await Promise.resolve();
    expect(active).toBe(3);
    release();

    await expect(Promise.all(jobs)).resolves.toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });
});
