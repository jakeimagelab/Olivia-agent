import type { LocalVisualFeatures } from "./hybrid-types";

type FeatureResult = { features: LocalVisualFeatures | null; error?: string };

function runWorker(worker: Worker, id: number, file: File, signal?: AbortSignal): Promise<FeatureResult> {
  return new Promise((resolve) => {
    const abort = () => resolve({ features: null, error: "작업이 취소되었습니다." });
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      signal?.removeEventListener("abort", abort);
    };
    const onMessage = (event: MessageEvent<{ id: number; ok: boolean; features?: LocalVisualFeatures; error?: string }>) => {
      if (event.data.id !== id) return;
      cleanup();
      resolve(event.data.ok && event.data.features
        ? { features: event.data.features }
        : { features: null, error: event.data.error ?? "이미지 특징 추출 실패" });
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      resolve({ features: null, error: event.message || "특징 Worker 오류" });
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage({ id, file, maxSize: 384 });
  });
}

export async function extractFeaturesWithWorkers(args: {
  files: File[];
  concurrency: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}): Promise<FeatureResult[]> {
  const { files, signal, onProgress } = args;
  const results = new Array<FeatureResult>(files.length);
  let cursor = 0;
  let completed = 0;
  const workerCount = Math.max(1, Math.min(args.concurrency, files.length || 1));
  const workers = Array.from({ length: workerCount }, () =>
    new Worker(new URL("./workers/feature-worker.ts", import.meta.url), { type: "module" }),
  );
  const consume = async (worker: Worker) => {
    while (!signal?.aborted) {
      const index = cursor++;
      if (index >= files.length) return;
      results[index] = await runWorker(worker, index, files[index], signal);
      completed += 1;
      onProgress?.(completed, files.length);
    }
  };
  try {
    await Promise.all(workers.map(consume));
  } finally {
    workers.forEach((worker) => worker.terminate());
  }
  return results;
}
