import { describe, expect, it } from "vitest";
import { virtualGridRange, virtualGridScrollTop } from "../lib/select-gallery/virtualGrid";

describe("customer Bridge virtual grid", () => {
  it("keeps a 1,645-image grid below 150 mounted cards", () => {
    const range = virtualGridRange({
      itemCount: 1_645,
      columns: 7,
      rowHeight: 200,
      scrollTop: 12_000,
      viewportHeight: 800,
      overscanRows: 3,
    });
    expect(range.end - range.start).toBeLessThanOrEqual(70);
    expect(range.start).toBeGreaterThan(0);
    expect(range.topPadding).toBeGreaterThan(0);
    expect(range.bottomPadding).toBeGreaterThan(0);
    expect(range.totalHeight).toBe(47_000);
  });

  it("clamps the first and final ranges without losing the tail", () => {
    const first = virtualGridRange({ itemCount: 20, columns: 4, rowHeight: 180, scrollTop: 0, viewportHeight: 360 });
    expect(first).toMatchObject({ start: 0, end: 20, topPadding: 0, bottomPadding: 0 });

    const last = virtualGridRange({ itemCount: 101, columns: 5, rowHeight: 180, scrollTop: 99_999, viewportHeight: 360 });
    expect(last.end).toBe(101);
    expect(last.start).toBeLessThan(101);
  });

  it("returns an empty stable range", () => {
    expect(virtualGridRange({ itemCount: 0, columns: 4, rowHeight: 180, scrollTop: 0, viewportHeight: 600 })).toEqual({
      start: 0,
      end: 0,
      topPadding: 0,
      bottomPadding: 0,
      rowCount: 0,
      totalHeight: 0,
    });
  });

  it("calculates the row position needed for keyboard navigation", () => {
    expect(virtualGridScrollTop({ index: 1_644, columns: 2, rowHeight: 240, gridOffsetTop: 13 })).toBe(197_293);
    expect(virtualGridScrollTop({ index: -1, columns: 0, rowHeight: 0 })).toBe(0);
  });
});
