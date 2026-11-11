import { describe, expect, it } from "vitest";

import { countCustomerSelection } from "@/lib/person-select/customerSelection";
import {
  applySelectionDiffsToSharedSnapshot,
  compactSelectionSyncDiffs,
  parsePersistedSelectionSyncQueue,
  pendingSelectionImageIds,
  SELECTION_SYNC_BATCH_LIMIT,
  selectionSyncRetryDelay,
  splitSelectionSyncPatches,
  type SharedSelectionSyncSnapshot,
} from "@/lib/person-select/selectionSync";
import { customerBridgeSelectedIds } from "@/lib/select-gallery/customerBridge";

const EMPTY_SHARED_SNAPSHOT: SharedSelectionSyncSnapshot = {
  revision: 1,
  selectedImageIds: [],
  ratings: {},
  colorLabels: {},
  imageNotes: {},
  customerMemo: "",
  updatedAt: null,
};

describe("person selection diff queue", () => {
  it("compacts 100 rapid rating changes and needs no more than five requests", () => {
    const { diffs } = splitSelectionSyncPatches(
      Array.from({ length: 100 }, (_, index) => ({ imageId: "image-1", rating: (index % 5) + 1 })),
      1,
      "2026-11-11T00:00:00.000Z",
    );
    const compacted = compactSelectionSyncDiffs(diffs);
    expect(compacted).toHaveLength(1);
    expect(compacted[0]).toMatchObject({ imageId: "image-1", rating: 5, clientSeq: 100 });
    expect(Math.ceil(compacted.length / SELECTION_SYNC_BATCH_LIMIT)).toBeLessThanOrEqual(5);
  });

  it("keeps a failed queue recoverable from localStorage payload", () => {
    const { diffs, nextSeq } = splitSelectionSyncPatches([
      { imageId: "image-1", rating: 4 },
      { imageId: "image-2", colorLabel: 8 },
    ], 7, "2026-11-11T00:00:00.000Z");
    const restored = parsePersistedSelectionSyncQueue(JSON.stringify({
      version: 1,
      clientId: "olivia_device_1",
      nextSeq,
      diffs,
      lastSavedAt: null,
    }));
    expect(restored?.diffs).toEqual(diffs);
    expect([...pendingSelectionImageIds(restored?.diffs ?? [])]).toEqual(["image-1", "image-2"]);
    expect(selectionSyncRetryDelay(0)).toBe(1_000);
    expect(selectionSyncRetryDelay(3)).toBe(10_000);
    expect(selectionSyncRetryDelay(99)).toBe(10_000);
  });

  it("is idempotent when the same diff is received twice", () => {
    const { diffs } = splitSelectionSyncPatches(
      [{ imageId: "image-1", rating: 3 }],
      1,
      "2026-11-11T00:00:00.000Z",
    );
    const once = applySelectionDiffsToSharedSnapshot(EMPTY_SHARED_SNAPSHOT, diffs);
    const twice = applySelectionDiffsToSharedSnapshot(once, diffs);
    expect(twice).toEqual(once);
  });

  it("keeps an untouched legacy classic selection while saving another field", () => {
    const legacy = { ...EMPTY_SHARED_SNAPSHOT, selectedImageIds: ["legacy-photo"] };
    const { diffs } = splitSelectionSyncPatches(
      [{ imageId: "other-photo", memo: "확인" }],
      1,
      "2026-11-11T00:00:00.000Z",
    );
    expect(applySelectionDiffsToSharedSnapshot(legacy, diffs).selectedImageIds).toEqual(["legacy-photo"]);
  });

  it("merges independent photos from two devices instead of replacing the whole selection", () => {
    const deviceA = splitSelectionSyncPatches(
      [{ imageId: "photo-1", rating: 5 }],
      1,
      "2026-11-11T00:00:00.000Z",
    ).diffs;
    const deviceB = splitSelectionSyncPatches(
      [{ imageId: "photo-2", colorLabel: 7 }],
      1,
      "2026-11-11T00:00:01.000Z",
    ).diffs;
    const merged = applySelectionDiffsToSharedSnapshot(
      applySelectionDiffsToSharedSnapshot(EMPTY_SHARED_SNAPSHOT, deviceA),
      deviceB,
    );
    expect(merged.ratings).toEqual({ "photo-1": 5 });
    expect(merged.colorLabels).toEqual({ "photo-2": 7 });
    expect(new Set(merged.selectedImageIds)).toEqual(new Set(["photo-1", "photo-2"]));
  });
});

describe("customer selection canonical count", () => {
  it("uses the same rating/color union in customer Bridge and the common counter", () => {
    const ratings = { a: 5, b: 2 };
    const colors = { b: 8, c: 6 };
    const bridgeIds = customerBridgeSelectedIds(ratings, colors);
    const commonCount = countCustomerSelection(["a", "b", "c", "d"].map((imageId) => ({
      rating: ratings[imageId as keyof typeof ratings] ?? null,
      colorLabel: colors[imageId as keyof typeof colors] ?? null,
    })));
    expect(commonCount).toBe(bridgeIds.size);
    expect(commonCount).toBe(3);
  });
});
