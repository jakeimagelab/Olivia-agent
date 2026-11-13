"use client";

import { useCallback, useRef } from "react";

import type { PersistedSelectionSyncQueue } from "@/lib/person-select/selectionSync";
import { createSelectionSyncPersistenceBuffer } from "@/lib/person-select/selectionSyncPersistence";

export const SELECTION_SYNC_STORAGE_EVENT = "olivia-selection-sync-storage";

type BrowserSelectionSyncPersistenceRequest = {
  storageKey: string;
  payload: PersistedSelectionSyncQueue;
};

export function useSelectionSyncBrowserPersistence() {
  const persistenceRef = useRef<ReturnType<typeof createSelectionSyncPersistenceBuffer<BrowserSelectionSyncPersistenceRequest>> | null>(null);

  if (!persistenceRef.current) {
    persistenceRef.current = createSelectionSyncPersistenceBuffer<BrowserSelectionSyncPersistenceRequest>({
      write: ({ storageKey, payload }) => {
        localStorage.setItem(storageKey, JSON.stringify(payload));
        window.dispatchEvent(new CustomEvent(SELECTION_SYNC_STORAGE_EVENT, { detail: { storageKey } }));
      },
      scheduleTask: (task) => {
        const timer = window.setTimeout(task, 0);
        return () => window.clearTimeout(timer);
      },
    });
  }

  const schedulePersistence = useCallback((storageKey: string, payload: PersistedSelectionSyncQueue) => {
    persistenceRef.current?.schedule({ storageKey, payload });
  }, []);
  const flushPersistence = useCallback(() => persistenceRef.current?.flush() ?? true, []);

  return { schedulePersistence, flushPersistence };
}
