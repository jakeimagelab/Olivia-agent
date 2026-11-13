import { describe, expect, it } from "vitest";

import {
  normalizeCustomerBridgeServerSnapshot,
  resolveCustomerBridgeSnapshotState,
} from "@/lib/select-gallery/customerBridgeSnapshot";
import { splitSelectionSyncPatches, type SharedSelectionSyncSnapshot } from "@/lib/person-select/selectionSync";

const SNAPSHOT: SharedSelectionSyncSnapshot = {
  revision: 4,
  selectedImageIds: ["legacy", "rated", "colored"],
  ratings: { rated: 5, invalid: 8 },
  colorLabels: { colored: 6, invalid: 2 },
  imageNotes: { rated: "확인" },
  customerMemo: "",
  updatedAt: "2026-11-14T00:00:00.000Z",
};

describe("customer bridge snapshot", () => {
  it("normalizes server marks before exposing the canonical selection", () => {
    const normalized = normalizeCustomerBridgeServerSnapshot(SNAPSHOT);

    expect(normalized.ratings).toEqual({ legacy: 1, rated: 5 });
    expect(normalized.colorLabels).toEqual({ colored: 6 });
    expect(new Set(normalized.selectedImageIds)).toEqual(new Set(["legacy", "rated", "colored"]));
    expect(normalized.imageNotes).toEqual({ rated: "확인" });
  });

  it("overlays pending changes without mutating the canonical server state", () => {
    const pending = splitSelectionSyncPatches([
      { imageId: "rated", rating: 3 },
      { imageId: "new-color", colorLabel: 9 },
    ], 1, "2026-11-14T00:00:01.000Z").diffs;
    const { canonical, displayed } = resolveCustomerBridgeSnapshotState(SNAPSHOT, pending);

    expect(canonical.ratings.rated).toBe(5);
    expect(displayed.ratings.rated).toBe(3);
    expect(displayed.colorLabels["new-color"]).toBe(9);
    expect(new Set(displayed.selectedImageIds)).toEqual(new Set(["legacy", "rated", "colored", "new-color"]));
  });
});
