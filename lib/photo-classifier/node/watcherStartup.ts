import type { PhotoWatcherScanResult } from "./photoWatcher";

export function isPhotoWatcherLockConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Photo Watcher.*(?:이미 실행 중|lock을 확보하지 못했습니다)/i.test(message);
}

export async function startPhotoWatcherWithLockRetry(options: {
  start: () => Promise<PhotoWatcherScanResult>;
  attempts?: number;
  delayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
}): Promise<PhotoWatcherScanResult> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const delayMs = Math.max(0, Math.floor(options.delayMs ?? 5_000));
  const wait = options.wait ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await options.start();
    } catch (error) {
      if (!isPhotoWatcherLockConflict(error) || attempt >= attempts) throw error;
      options.onRetry?.(attempt, error);
      await wait(delayMs);
    }
  }

  throw new Error("Photo Watcher 시작 재시도 횟수를 소진했습니다.");
}
