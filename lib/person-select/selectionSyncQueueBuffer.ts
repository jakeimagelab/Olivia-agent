import {
  compactSelectionSyncDiffs,
  selectionSyncDiffKey,
  splitSelectionSyncPatches,
  type PersistedSelectionSyncQueue,
  type SelectionSyncDiff,
  type SelectionSyncPatch,
} from "./selectionSync";

export class SelectionSyncQueueBuffer {
  #diffs = new Map<string, SelectionSyncDiff>();
  #clientId: string;
  #nextSeq = 1;
  #lastSavedAt: string | null = null;

  constructor(clientId: string) {
    this.#clientId = clientId;
  }

  get clientId() {
    return this.#clientId;
  }

  get size() {
    return this.#diffs.size;
  }

  get lastSavedAt() {
    return this.#lastSavedAt;
  }

  values() {
    return compactSelectionSyncDiffs([...this.#diffs.values()]);
  }

  batch(limit: number) {
    return this.values().slice(0, limit);
  }

  enqueue(patches: readonly SelectionSyncPatch[]) {
    const split = splitSelectionSyncPatches(patches, this.#nextSeq);
    this.#nextSeq = split.nextSeq;
    for (const diff of split.diffs) this.#diffs.set(selectionSyncDiffKey(diff), diff);
    return this.values();
  }

  acknowledge(sent: readonly SelectionSyncDiff[]) {
    for (const diff of sent) {
      const key = selectionSyncDiffKey(diff);
      const current = this.#diffs.get(key);
      if (current && current.clientSeq <= diff.clientSeq) this.#diffs.delete(key);
    }
    return this.values();
  }

  markSaved(savedAt: string) {
    this.#lastSavedAt = savedAt;
  }

  reset(clientId: string) {
    this.#diffs = new Map();
    this.#clientId = clientId;
    this.#nextSeq = 1;
    this.#lastSavedAt = null;
  }

  restore(payload: PersistedSelectionSyncQueue) {
    this.#clientId = payload.clientId;
    this.#nextSeq = payload.nextSeq;
    this.#lastSavedAt = payload.lastSavedAt;
    this.#diffs = new Map(payload.diffs.map((diff) => [selectionSyncDiffKey(diff), diff]));
    return this.values();
  }

  persisted(prepared = this.values()): PersistedSelectionSyncQueue {
    return {
      version: 1,
      clientId: this.#clientId,
      nextSeq: this.#nextSeq,
      diffs: prepared,
      lastSavedAt: this.#lastSavedAt,
    };
  }
}
