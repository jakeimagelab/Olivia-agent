import { mapWithConcurrency } from "./browserProcessing";
import type { SplitJpgFile } from "./browserFileOps";
import type { TimestampSource } from "./hybrid-types";
import { readPhotoTimestamp } from "./timestamp";

export type TimestampedBrowserPhoto = {
  name: string;
  handle: FileSystemFileHandle;
  file: File;
  mtime: number;
  timestampSource: TimestampSource;
  warning?: string;
};

type TimestampScanProgress = {
  completed: number;
  total: number;
  fileName: string;
};

type ReadBrowserPhotoTimestampsOptions = {
  concurrency?: number;
  readTimestamp?: typeof readPhotoTimestamp;
  onProgress?: (progress: TimestampScanProgress) => void;
};

export async function readBrowserPhotoTimestamps(
  jpgFiles: readonly SplitJpgFile[],
  {
    concurrency = 6,
    readTimestamp = readPhotoTimestamp,
    onProgress,
  }: ReadBrowserPhotoTimestampsOptions = {},
): Promise<TimestampedBrowserPhoto[]> {
  let completed = 0;
  return mapWithConcurrency([...jpgFiles], concurrency, async (entry) => {
    const exif = await readTimestamp(entry.file);
    completed += 1;
    onProgress?.({ completed, total: jpgFiles.length, fileName: entry.name });
    return {
      name: entry.name,
      handle: entry.handle,
      file: entry.file,
      mtime: exif?.timestamp ?? entry.mtime,
      timestampSource: exif?.source ?? "mtime",
      warning: exif ? undefined : "EXIF 촬영시간 없음 — mtime 사용",
    };
  });
}
