export type StudioAnalysisStart<T> = {
  completed: number;
  total: number;
  index: number;
  item: T;
};

export type StudioAnalysisProgress<T> = StudioAnalysisStart<T> & {
  completed: number;
  items: T[];
};

type RunStudioAnalysisOptions<T> = {
  items: readonly T[];
  targetIndices?: readonly number[];
  concurrency: number;
  analyze: (item: T, index: number) => Promise<T>;
  recover: (error: unknown, item: T, index: number) => T | Promise<T>;
  onStart?: (event: StudioAnalysisStart<T>) => void;
  onProgress?: (event: StudioAnalysisProgress<T>) => void;
};

export async function runStudioAnalysisConcurrently<T>({
  items,
  targetIndices,
  concurrency,
  analyze,
  recover,
  onStart,
  onProgress,
}: RunStudioAnalysisOptions<T>): Promise<T[]> {
  const results = [...items];
  const indices = targetIndices ? [...targetIndices] : results.map((_, index) => index);
  const total = indices.length;
  let cursor = 0;
  let completed = 0;

  const worker = async () => {
    while (cursor < indices.length) {
      const index = indices[cursor++];
      const item = results[index];
      onStart?.({ completed, total, index, item });
      try {
        results[index] = await analyze(item, index);
      } catch (error) {
        results[index] = await recover(error, item, index);
      }
      completed += 1;
      onProgress?.({
        completed,
        total,
        index,
        item: results[index],
        items: [...results],
      });
    }
  };

  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
