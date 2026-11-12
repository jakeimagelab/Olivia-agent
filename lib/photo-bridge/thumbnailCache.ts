import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";

type QueueTask<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

export function createBridgeThumbnailTaskQueue(concurrency = 4) {
  const limit = Math.max(1, Math.trunc(concurrency));
  const waiting: QueueTask<unknown>[] = [];
  let active = 0;

  const drain = () => {
    while (active < limit && waiting.length) {
      const task = waiting.shift();
      if (!task) return;
      active += 1;
      void task.run()
        .then(task.resolve, task.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return {
    run<T>(task: () => Promise<T>) {
      return new Promise<T>((resolve, reject) => {
        waiting.push({
          run: task,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        drain();
      });
    },
  };
}

type ThumbnailCacheEntry = {
  promise: Promise<string>;
  objectUrl?: string;
};

const decodeQueue = createBridgeThumbnailTaskQueue(4);
const thumbnailCache = new Map<string, ThumbnailCacheEntry>();
let cacheGeneration = 0;

function revokeObjectUrl(url: string | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

async function createLocalThumbnailUrl(photo: BridgeJpgFile) {
  if (!photo.file) throw new Error(`${photo.name} 원본 파일이 없습니다.`);
  try {
    const bitmap = await createImageBitmap(photo.file, { imageOrientation: "from-image" });
    const max = 420;
    const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("썸네일 생성 실패")),
      "image/jpeg",
      0.76,
    ));
    return URL.createObjectURL(blob);
  } catch {
    return URL.createObjectURL(photo.file);
  }
}

export function getBridgeThumbnailUrl(photo: BridgeJpgFile) {
  const cached = thumbnailCache.get(photo.id);
  if (cached) return cached.promise;
  if (!photo.file) {
    if (!photo.thumbnailUrl) return Promise.reject(new Error(`${photo.name} 썸네일 주소가 없습니다.`));
    const entry = { promise: Promise.resolve(photo.thumbnailUrl) };
    thumbnailCache.set(photo.id, entry);
    return entry.promise;
  }

  const generation = cacheGeneration;
  const entry: ThumbnailCacheEntry = { promise: Promise.resolve("") };
  entry.promise = decodeQueue.run(async () => {
    if (generation !== cacheGeneration) throw new DOMException("지난 폴더 썸네일 작업입니다.", "AbortError");
    const url = await createLocalThumbnailUrl(photo);
    entry.objectUrl = url;
    if (generation !== cacheGeneration || thumbnailCache.get(photo.id) !== entry) {
      revokeObjectUrl(url);
    }
    return url;
  }).catch((error) => {
    if (thumbnailCache.get(photo.id) === entry) thumbnailCache.delete(photo.id);
    throw error;
  });
  thumbnailCache.set(photo.id, entry);
  return entry.promise;
}

export function resetBridgeThumbnailCache() {
  cacheGeneration += 1;
  for (const entry of thumbnailCache.values()) revokeObjectUrl(entry.objectUrl);
  thumbnailCache.clear();
}
