import { describe, expect, it } from "vitest";

import { SelectionSyncQueueBuffer } from "@/lib/person-select/selectionSyncQueueBuffer";

describe("SelectionSyncQueueBuffer", () => {
  it("keeps a newer edit when an older in-flight batch is acknowledged", () => {
    const buffer = new SelectionSyncQueueBuffer("olivia_device_1");
    buffer.enqueue([{ imageId: "photo-1", rating: 3 }]);
    const inFlight = buffer.batch(200);
    buffer.enqueue([{ imageId: "photo-1", rating: 5 }]);

    expect(buffer.acknowledge(inFlight)).toMatchObject([{ imageId: "photo-1", rating: 5 }]);
  });

  it("restores sequence and pending values from persisted state", () => {
    const original = new SelectionSyncQueueBuffer("olivia_device_1");
    original.enqueue([
      { imageId: "photo-1", rating: 4 },
      { imageId: "photo-2", memo: "확인" },
    ]);
    original.markSaved("2026-11-14T00:00:00.000Z");

    const restored = new SelectionSyncQueueBuffer("temporary");
    restored.restore(original.persisted());
    const next = restored.enqueue([{ imageId: "photo-3", colorLabel: 8 }]);

    expect(restored.clientId).toBe("olivia_device_1");
    expect(restored.lastSavedAt).toBe("2026-11-14T00:00:00.000Z");
    expect(next.map((diff) => diff.clientSeq)).toEqual([1, 2, 3]);
  });
});
