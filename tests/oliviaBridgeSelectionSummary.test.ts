import { describe, expect, it } from "vitest";

import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import { createBridgeSelectionSummary } from "@/lib/photo-bridge/selectionSummary";

const jpgs = ["a", "b", "c", "d"].map((id): BridgeJpgFile => ({
  id,
  name: `${id}.JPG`,
  relativeDirectory: "",
  relativePath: `${id}.JPG`,
  extension: "JPG",
  size: 100,
  lastModified: 200,
}));

describe("Bridge selection summary", () => {
  it("별점·컬러·미선택 장수와 선택 출처 장수를 한 번에 계산한다", () => {
    const summary = createBridgeSelectionSummary({
      jpgs,
      selectedIds: new Set(["a", "b", "c"]),
      ratings: { a: 5, b: 5 },
      colorLabels: { b: 6, c: 7 },
      excludedIds: new Set(["a", "b", "c"]),
      selectionSource: "both",
      adobeSelectedIds: new Set(["a", "b"]),
      manualSelectedIds: new Set(["b", "c"]),
    });

    expect(summary.selectionCounts).toEqual({
      starred: 2,
      colored: 2,
      selected: 3,
      unselected: 1,
    });
    expect(summary.selectedPhotos.map((photo) => photo.id)).toEqual(["a", "b", "c"]);
    expect(summary.adobeSelectedCount).toBe(2);
    expect(summary.manualSelectedCount).toBe(2);
    expect(summary.allSelectedExcluded).toBe(true);
  });

  it("여러 선택의 별점·컬러가 다르면 공통값 대신 혼합 상태를 반환한다", () => {
    const summary = createBridgeSelectionSummary({
      jpgs,
      selectedIds: new Set(["a", "b"]),
      ratings: { a: 5, b: 3 },
      colorLabels: { a: 6, b: 9 },
      excludedIds: new Set(),
      selectionSource: "olivia",
      adobeSelectedIds: new Set(["a"]),
      manualSelectedIds: new Set(["a", "b"]),
    });

    expect(summary.commonSelectedRating).toBeNull();
    expect(summary.commonSelectedColor).toBeNull();
    expect(summary.selectedRatingMixed).toBe(true);
    expect(summary.selectedColorMixed).toBe(true);
    expect(summary.adobeSelectedCount).toBe(0);
    expect(summary.manualSelectedCount).toBe(2);
    expect(summary.allSelectedExcluded).toBe(false);
  });

  it("단일 선택은 0점·무컬러도 공통값으로 유지한다", () => {
    const summary = createBridgeSelectionSummary({
      jpgs,
      selectedIds: new Set(["d"]),
      ratings: {},
      colorLabels: {},
      excludedIds: new Set(),
      selectionSource: "adobe",
      adobeSelectedIds: new Set(["d"]),
      manualSelectedIds: new Set(["d"]),
    });

    expect(summary.commonSelectedRating).toBe(0);
    expect(summary.commonSelectedColor).toBe(0);
    expect(summary.selectedRatingMixed).toBe(false);
    expect(summary.selectedColorMixed).toBe(false);
    expect(summary.manualSelectedCount).toBe(0);
  });
});
