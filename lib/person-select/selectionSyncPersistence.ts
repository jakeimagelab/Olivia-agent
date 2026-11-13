export type SelectionSyncPersistenceBuffer<T> = {
  schedule: (value: T) => void;
  flush: () => boolean;
  hasPendingWrite: () => boolean;
};

export function readSelectionSyncStorageValue(
  storage: Pick<Storage, "getItem">,
  storageKey: string,
) {
  try {
    return storage.getItem(storageKey);
  } catch {
    return null;
  }
}

type PersistenceBufferOptions<T> = {
  write: (value: T) => void;
  scheduleTask?: (task: () => void) => () => void;
};

function scheduleOnNextTask(task: () => void) {
  const timer = setTimeout(task, 0);
  return () => clearTimeout(timer);
}

/**
 * 여러 선택이 한 이벤트 구간에 연속으로 들어오면 마지막 큐 상태만 저장한다.
 * 네트워크 전송 전·화면 종료 전에는 flush()로 즉시 보존할 수 있다.
 */
export function createSelectionSyncPersistenceBuffer<T>({
  write,
  scheduleTask = scheduleOnNextTask,
}: PersistenceBufferOptions<T>): SelectionSyncPersistenceBuffer<T> {
  let pending: T | undefined;
  let cancelScheduledTask: (() => void) | null = null;

  const flush = () => {
    if (cancelScheduledTask) {
      cancelScheduledTask();
      cancelScheduledTask = null;
    }
    if (pending === undefined) return true;
    try {
      write(pending);
      pending = undefined;
      return true;
    } catch {
      return false;
    }
  };

  return {
    schedule(value) {
      pending = value;
      if (cancelScheduledTask) return;
      cancelScheduledTask = scheduleTask(() => {
        cancelScheduledTask = null;
        flush();
      });
    },
    flush,
    hasPendingWrite: () => pending !== undefined,
  };
}
