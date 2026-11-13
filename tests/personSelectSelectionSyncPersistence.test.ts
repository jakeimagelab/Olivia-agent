import { describe, expect, it, vi } from "vitest";

import {
  createSelectionSyncPersistenceBuffer,
  readSelectionSyncStorageValue,
} from "@/lib/person-select/selectionSyncPersistence";

describe("person selection sync persistence", () => {
  it("coalesces rapid changes into one write with the latest queue", () => {
    let scheduled: (() => void) | null = null;
    const write = vi.fn();
    const buffer = createSelectionSyncPersistenceBuffer({
      write,
      scheduleTask: (task) => {
        scheduled = task;
        return () => { scheduled = null; };
      },
    });

    buffer.schedule({ diffs: [1] });
    buffer.schedule({ diffs: [1, 2] });
    buffer.schedule({ diffs: [1, 2, 3] });

    expect(write).not.toHaveBeenCalled();
    expect(buffer.hasPendingWrite()).toBe(true);
    expect(scheduled).not.toBeNull();
    (scheduled as unknown as () => void)();
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith({ diffs: [1, 2, 3] });
    expect(buffer.hasPendingWrite()).toBe(false);
  });

  it("flushes synchronously before navigation or a network save", () => {
    const write = vi.fn();
    const cancel = vi.fn();
    const buffer = createSelectionSyncPersistenceBuffer({
      write,
      scheduleTask: () => cancel,
    });

    buffer.schedule({ diffs: ["latest"] });
    expect(buffer.flush()).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith({ diffs: ["latest"] });
  });

  it("keeps the latest queue when browser storage temporarily fails", () => {
    const write = vi.fn()
      .mockImplementationOnce(() => { throw new Error("storage unavailable"); })
      .mockImplementationOnce(() => undefined);
    const buffer = createSelectionSyncPersistenceBuffer({
      write,
      scheduleTask: () => () => undefined,
    });

    buffer.schedule({ diffs: ["recoverable"] });
    expect(buffer.flush()).toBe(false);
    expect(buffer.hasPendingWrite()).toBe(true);
    expect(buffer.flush()).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(buffer.hasPendingWrite()).toBe(false);
  });

  it("treats unavailable browser storage as an empty persisted queue", () => {
    const storage = { getItem: vi.fn(() => { throw new Error("storage disabled"); }) };

    expect(readSelectionSyncStorageValue(storage, "selection:v1")).toBeNull();
  });
});
