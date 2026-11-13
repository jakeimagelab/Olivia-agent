import type { WorkerJsonRecord } from "./workerPayload";

export type CoalescedProgressReporter = {
  push: (progress: WorkerJsonRecord) => void;
  flush: () => Promise<void>;
};

/**
 * Keep progress observational and bounded: at most one HTTP report is in flight,
 * while newer snapshots replace older unsent ones. Terminal job reporting calls
 * flush(), so completion never waits behind one request per processed file.
 */
export function createCoalescedProgressReporter(
  send: (progress: WorkerJsonRecord) => Promise<void>,
  options: {
    intervalMs?: number;
    onError?: (error: unknown) => void;
  } = {},
): CoalescedProgressReporter {
  const intervalMs = Math.max(0, options.intervalMs ?? 500);
  const onError = options.onError ?? (() => undefined);
  let pending: WorkerJsonRecord | null = null;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastStartedAt = 0;

  const clearScheduled = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const startPending = (): void => {
    if (inFlight || !pending) return;
    const waitMs = Math.max(0, intervalMs - (Date.now() - lastStartedAt));
    if (waitMs > 0) {
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          startPending();
        }, waitMs);
      }
      return;
    }

    const snapshot = pending;
    pending = null;
    lastStartedAt = Date.now();
    inFlight = send(snapshot)
      .catch(onError)
      .finally(() => {
        inFlight = null;
        startPending();
      });
  };

  return {
    push(progress) {
      pending = progress;
      startPending();
    },
    async flush() {
      clearScheduled();
      while (inFlight) await inFlight;
      clearScheduled();
      if (!pending) return;
      const snapshot = pending;
      pending = null;
      lastStartedAt = Date.now();
      await send(snapshot).catch(onError);
      while (inFlight) await inFlight;
    },
  };
}
