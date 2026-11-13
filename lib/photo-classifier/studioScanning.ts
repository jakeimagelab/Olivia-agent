import { loadStudioPreviewMetrics, mapWithConcurrency } from "./browserProcessing";
import type { SplitJpgFile } from "./browserFileOps";
import type { StudioPhotoFile } from "./studioGrouping";

type StudioScanProgress = {
  completed: number;
  total: number;
  fileName: string;
};

type PrepareStudioPhotoFilesOptions = {
  concurrency?: number;
  loadPreview?: typeof loadStudioPreviewMetrics;
  onProgress?: (progress: StudioScanProgress) => void;
};

export async function prepareStudioPhotoFiles(
  jpgFiles: readonly SplitJpgFile[],
  {
    concurrency = 3,
    loadPreview = loadStudioPreviewMetrics,
    onProgress,
  }: PrepareStudioPhotoFilesOptions = {},
): Promise<StudioPhotoFile[]> {
  const sorted = [...jpgFiles].sort((left, right) => left.mtime - right.mtime);
  let completed = 0;
  return mapWithConcurrency(sorted, concurrency, async (source) => {
    const { thumbUrl, brightness } = await loadPreview(source.file, 100);
    completed += 1;
    onProgress?.({ completed, total: sorted.length, fileName: source.name });
    return {
      name: source.name,
      basename: source.name.replace(/\.[^.]+$/u, ""),
      handle: source.handle,
      mtime: source.mtime,
      fileSize: source.fileSize,
      thumbUrl,
      brightness,
      lightingStatus: "normal",
      hasGown: false,
      innerWear: "기타",
      clothingLabel: "미분류",
      poseType: "Unknown",
      isFamilyProfile: false,
      confidence: 0,
      analyzed: false,
      groupKey: "__PENDING__",
    } satisfies StudioPhotoFile;
  });
}
