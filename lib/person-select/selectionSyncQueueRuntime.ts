import {
  pendingSelectionImageIds,
  selectionSyncRetryDelay,
  SELECTION_SYNC_BATCH_LIMIT,
  SELECTION_SYNC_DEBOUNCE_MS,
  type PersistedSelectionSyncQueue,
  type SelectionSyncDiff,
  type SelectionSyncPatch,
} from "./selectionSync";
import { SelectionSyncQueueBuffer } from "./selectionSyncQueueBuffer";
import { SelectionSyncRequestError } from "./selectionSyncClient";

export type SelectionSyncQueueStatus = "saved" | "waiting" | "saving" | "retrying" | "error";

export type SelectionSyncQueueState = {
  status: SelectionSyncQueueStatus;
  pendingCount: number;
  pendingImageIds: Set<string>;
  lastSavedAt: string | null;
  message: string;
};

type SelectionSyncQueueHandlers<TSnapshot> = {
  enabled: boolean;
  sendBatch: (input: { clientId: string; diffs: SelectionSyncDiff[] }) => Promise<TSnapshot>;
  onSnapshot: (snapshot: TSnapshot, pending: SelectionSyncDiff[]) => void;
  onRestore?: (pending: SelectionSyncDiff[]) => void;
  onPendingChange?: (pending: SelectionSyncDiff[]) => void;
  persist: (payload: PersistedSelectionSyncQueue) => void;
  flushPersistence: () => boolean;
};

type SelectionSyncQueueRuntimeOptions<TSnapshot> = SelectionSyncQueueHandlers<TSnapshot> & {
  createClientId: () => string;
  now?: () => string;
  scheduleTask: (task: () => void, delay: number) => unknown;
  cancelTask: (handle: unknown) => void;
  onStateChange: (state: SelectionSyncQueueState) => void;
};

export function initialSelectionSyncQueueState(): SelectionSyncQueueState {
  return {
    status: "saved",
    pendingCount: 0,
    pendingImageIds: new Set(),
    lastSavedAt: null,
    message: "",
  };
}

export class SelectionSyncQueueRuntime<TSnapshot> {
  #buffer: SelectionSyncQueueBuffer;
  #handlers: SelectionSyncQueueHandlers<TSnapshot>;
  #timer: unknown = null;
  #inFlight: Promise<boolean> | null = null;
  #retryAttempt = 0;
  #generation = 0;
  #state = initialSelectionSyncQueueState();
  readonly #createClientId: () => string;
  readonly #now: () => string;
  readonly #scheduleTask: (task: () => void, delay: number) => unknown;
  readonly #cancelTask: (handle: unknown) => void;
  readonly #onStateChange: (state: SelectionSyncQueueState) => void;

  constructor(options: SelectionSyncQueueRuntimeOptions<TSnapshot>) {
    this.#createClientId = options.createClientId;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#scheduleTask = options.scheduleTask;
    this.#cancelTask = options.cancelTask;
    this.#onStateChange = options.onStateChange;
    this.#buffer = new SelectionSyncQueueBuffer(this.#createClientId());
    this.#handlers = options;
  }

  configure(handlers: SelectionSyncQueueHandlers<TSnapshot>) {
    this.#handlers = handlers;
  }

  getState() {
    return this.#state;
  }

  getPendingDiffs() {
    return this.#buffer.values();
  }

  clearScheduledFlush() {
    if (this.#timer !== null) this.#cancelTask(this.#timer);
    this.#timer = null;
  }

  reset(restored: PersistedSelectionSyncQueue | null) {
    this.clearScheduledFlush();
    this.#generation += 1;
    this.#inFlight = null;
    this.#retryAttempt = 0;
    this.#buffer.reset(this.#createClientId());
    this.#state = initialSelectionSyncQueueState();

    if (restored) {
      const pending = this.#buffer.restore(restored);
      this.#state = this.#stateWithPending(pending, {
        status: pending.length ? "retrying" : "saved",
        lastSavedAt: restored.lastSavedAt,
      });
      if (pending.length) {
        this.#handlers.onRestore?.(pending);
        this.#schedule(250);
      }
    }
    this.#emit();
  }

  enqueue(patches: readonly SelectionSyncPatch[]) {
    if (!this.#handlers.enabled || !patches.length) return;
    const pending = this.#buffer.enqueue(patches);
    this.#state = this.#stateWithPending(pending, { status: "waiting", message: "" });
    this.#emit();
    this.#handlers.onPendingChange?.(pending);
    this.#persist(pending);
    this.#schedule();
  }

  async flush(): Promise<boolean> {
    if (!this.#handlers.enabled) return this.#buffer.size === 0;
    if (this.#inFlight) return this.#inFlight;
    const batch = this.#buffer.batch(SELECTION_SYNC_BATCH_LIMIT);
    if (!batch.length) {
      this.#updateState({ status: "saved", message: "" });
      return true;
    }

    this.clearScheduledFlush();
    this.#handlers.flushPersistence();
    this.#updateState({ status: "saving", message: "" });
    const generation = this.#generation;
    const request = this.#send(batch, generation);
    this.#inFlight = request;
    return request;
  }

  async flushNow() {
    this.clearScheduledFlush();
    while (this.#buffer.size) {
      const done = await this.flush();
      if (!done && this.#buffer.size) return false;
    }
    return this.#buffer.size === 0;
  }

  retry() {
    this.#retryAttempt = 0;
    this.#updateState({ status: this.#buffer.size ? "waiting" : "saved", message: "" });
    this.#schedule(0);
  }

  async #send(batch: SelectionSyncDiff[], generation: number) {
    try {
      const snapshot = await this.#handlers.sendBatch({ clientId: this.#buffer.clientId, diffs: batch });
      if (generation !== this.#generation) return false;
      this.#buffer.acknowledge(batch);
      this.#retryAttempt = 0;
      const savedAt = this.#now();
      this.#buffer.markSaved(savedAt);
      const pending = this.#buffer.values();
      this.#state = this.#stateWithPending(pending, {
        status: pending.length ? "waiting" : "saved",
        lastSavedAt: savedAt,
        message: "",
      });
      this.#emit();
      this.#handlers.onSnapshot(snapshot, pending);
      this.#persist(pending);
      if (pending.length) this.#schedule(0);
      return true;
    } catch (cause) {
      if (generation !== this.#generation) return false;
      const error = cause instanceof SelectionSyncRequestError
        ? cause
        : new SelectionSyncRequestError(cause instanceof Error ? cause.message : "선택을 저장하지 못했습니다.");
      const pending = this.#buffer.values();
      this.#persist(pending);
      if (error.options?.retryable === false) {
        this.#state = this.#stateWithPending(pending, { status: "error", message: error.message });
        this.#emit();
        return false;
      }
      const delay = error.options?.retryAfterMs ?? selectionSyncRetryDelay(this.#retryAttempt);
      this.#retryAttempt += 1;
      this.#state = this.#stateWithPending(pending, { status: "retrying", message: error.message });
      this.#emit();
      this.#schedule(delay);
      return false;
    } finally {
      if (generation === this.#generation) this.#inFlight = null;
    }
  }

  #schedule(delay = SELECTION_SYNC_DEBOUNCE_MS) {
    this.clearScheduledFlush();
    if (!this.#handlers.enabled || !this.#buffer.size) return;
    this.#timer = this.#scheduleTask(() => {
      this.#timer = null;
      void this.flush();
    }, delay);
  }

  #persist(prepared: SelectionSyncDiff[]) {
    this.#handlers.persist(this.#buffer.persisted(prepared));
  }

  #stateWithPending(pending: SelectionSyncDiff[], patch: Partial<SelectionSyncQueueState>) {
    return {
      ...this.#state,
      ...patch,
      pendingCount: pending.length,
      pendingImageIds: pendingSelectionImageIds(pending),
    };
  }

  #updateState(patch: Partial<SelectionSyncQueueState>) {
    this.#state = { ...this.#state, ...patch };
    this.#emit();
  }

  #emit() {
    this.#onStateChange(this.#state);
  }
}
