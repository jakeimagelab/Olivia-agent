import { describe, expect, it, vi } from "vitest";

import type { SelectionSyncDiff } from "@/lib/person-select/selectionSync";
import { SelectionSyncRequestError } from "@/lib/person-select/selectionSyncClient";
import {
  SelectionSyncQueueRuntime,
  type SelectionSyncQueueState,
} from "@/lib/person-select/selectionSyncQueueRuntime";

type SendBatch = (input: { clientId: string; diffs: SelectionSyncDiff[] }) => Promise<{ saved: boolean }>;

function runtimeHarness(sendBatch = vi.fn<SendBatch>(async () => ({ saved: true }))) {
  const states: SelectionSyncQueueState[] = [];
  const scheduled: Array<{ task: () => void; delay: number }> = [];
  const snapshots: unknown[] = [];
  const persisted: unknown[] = [];
  let clientId = 0;
  const runtime = new SelectionSyncQueueRuntime({
    enabled: true,
    sendBatch,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    persist: (payload) => persisted.push(payload),
    flushPersistence: () => true,
    createClientId: () => `olivia_device_${++clientId}`,
    now: () => "2026-11-14T00:00:00.000Z",
    scheduleTask: (task, delay) => {
      const entry = { task, delay };
      scheduled.push(entry);
      return entry;
    },
    cancelTask: (handle) => {
      const index = scheduled.indexOf(handle as { task: () => void; delay: number });
      if (index >= 0) scheduled.splice(index, 1);
    },
    onStateChange: (state) => states.push(state),
  });
  return { runtime, sendBatch, states, scheduled, snapshots, persisted };
}

describe("selection sync queue runtime", () => {
  it("compacts rapid edits and publishes one UI state per enqueue", async () => {
    const harness = runtimeHarness();
    harness.runtime.enqueue([{ imageId: "photo-1", rating: 1 }]);
    harness.runtime.enqueue([{ imageId: "photo-1", rating: 5 }]);

    expect(harness.runtime.getPendingDiffs()).toHaveLength(1);
    expect(harness.runtime.getPendingDiffs()[0]).toMatchObject({ imageId: "photo-1", rating: 5 });
    expect(harness.runtime.getState()).toMatchObject({ status: "waiting", pendingCount: 1 });

    await harness.runtime.flushNow();

    expect(harness.sendBatch).toHaveBeenCalledOnce();
    expect(vi.mocked(harness.sendBatch).mock.calls[0][0].diffs).toHaveLength(1);
    expect(harness.runtime.getState()).toMatchObject({
      status: "saved",
      pendingCount: 0,
      lastSavedAt: "2026-11-14T00:00:00.000Z",
    });
  });

  it("keeps a retryable failure queued and schedules the configured retry", async () => {
    const sendBatch = vi.fn(async () => {
      throw new SelectionSyncRequestError("잠시 후 자동 저장", { retryable: true, retryAfterMs: 4_000 });
    });
    const harness = runtimeHarness(sendBatch);
    harness.runtime.enqueue([{ imageId: "photo-1", colorLabel: 6 }]);

    await harness.runtime.flush();

    expect(harness.runtime.getState()).toMatchObject({ status: "retrying", pendingCount: 1, message: "잠시 후 자동 저장" });
    expect(harness.scheduled.at(-1)?.delay).toBe(4_000);
    expect(harness.runtime.getPendingDiffs()).toHaveLength(1);
  });

  it("does not apply an old response after the storage scope changes", async () => {
    let resolveRequest: ((snapshot: { saved: boolean }) => void) | null = null;
    const sendBatch = vi.fn(() => new Promise<{ saved: boolean }>((resolve) => { resolveRequest = resolve; }));
    const harness = runtimeHarness(sendBatch);
    harness.runtime.enqueue([{ imageId: "old-photo", rating: 3 }]);
    const oldFlush = harness.runtime.flush();

    harness.runtime.reset(null);
    harness.runtime.enqueue([{ imageId: "new-photo", rating: 5 }]);
    (resolveRequest as unknown as (snapshot: { saved: boolean }) => void)({ saved: true });
    await oldFlush;

    expect(harness.runtime.getPendingDiffs()).toMatchObject([{ imageId: "new-photo", rating: 5 }]);
    expect(harness.snapshots).toEqual([]);
  });
});
