import { describe, expect, it } from "vitest";

import { aspectRatioWithinTolerance, orientedPhotoAspectRatio } from "@/lib/photo-retouch/aspectRatio";
import { consumePhotoRetouchHandoff, storePhotoRetouchHandoff } from "@/lib/photo-retouch/handoff";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("photo retouch handoff and preview aspect", () => {
  it.each([
    [3_000, 2_000, 1, 1.5],
    [2_000, 3_000, 1, 2 / 3],
    [2_000, 2_000, 1, 1],
    [3_000, 2_000, 6, 2 / 3],
    [3_000, 2_000, 8, 2 / 3],
  ])("keeps %sx%s orientation %s within 0.5%%", (width, height, orientation, expected) => {
    expect(aspectRatioWithinTolerance(orientedPhotoAspectRatio(width, height, orientation), expected)).toBe(true);
  });

  it("consumes a bridge handoff exactly once", () => {
    const storage = new MemoryStorage();
    const id = storePhotoRetouchHandoff(storage as unknown as Storage, {
      sourcePath: "root-0/촬영/보정본",
      selectedFileNames: ["A.JPG", "사람/B.JPG", "A.JPG"],
    }, 100);
    expect(consumePhotoRetouchHandoff(storage as unknown as Storage, id, 200)).toEqual({
      sourcePath: "root-0/촬영/보정본",
      selectedFileNames: ["A.JPG", "사람/B.JPG"],
    });
    expect(consumePhotoRetouchHandoff(storage as unknown as Storage, id, 200)).toBeNull();
  });

  it("rejects expired handoffs", () => {
    const storage = new MemoryStorage();
    const id = storePhotoRetouchHandoff(storage as unknown as Storage, { sourcePath: "root-0/보정본", selectedFileNames: [] }, 0);
    expect(consumePhotoRetouchHandoff(storage as unknown as Storage, id, 31 * 60 * 1_000)).toBeNull();
  });
});
