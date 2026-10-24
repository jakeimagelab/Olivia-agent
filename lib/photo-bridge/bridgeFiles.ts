import { CAMERA_JPG_EXTENSIONS, RAW_PHOTO_EXTENSIONS, isHiddenSystemFile } from "@/lib/photo/extensions";
import { buildVisualBoundaryCandidates, sortTimestampedFiles } from "@/lib/photo-classifier/candidate-builder";
import { decideBoundary } from "@/lib/photo-classifier/boundary-score";
import { stabilizeBoundaries } from "@/lib/photo-classifier/boundary-stabilizer";
import { getClassificationSettings } from "@/lib/photo-classifier/classification-settings";
import { extractFeaturesWithWorkers } from "@/lib/photo-classifier/feature-worker-client";
import type { LocalVisualFeatures, SceneBoundaryDecision, TimestampSource } from "@/lib/photo-classifier/hybrid-types";
import { featureCacheKey, getCachedFeature, setCachedFeature } from "@/lib/photo-classifier/scene-cache";
import { buildSceneRangesFromBoundaries } from "@/lib/photo-classifier/scene-builder";
import { readPhotoTimestamp } from "@/lib/photo-classifier/timestamp";

const BRIDGE_SIDECAR_EXTENSIONS = new Set(["xmp"]);

export type BridgeFileKind = "jpg" | "raw" | "sidecar" | "other";

export type BridgeJpgFile = {
  id: string;
  name: string;
  extension: string;
  handle: FileSystemFileHandle;
  file: File;
  size: number;
  lastModified: number;
};

export type BridgeRawFile = Omit<BridgeJpgFile, "file">;

export type BridgeSidecarFile = BridgeRawFile;

export type BridgeFolderScan = {
  folders: FileSystemDirectoryHandle[];
  jpgs: BridgeJpgFile[];
  raws: BridgeRawFile[];
  sidecars: BridgeSidecarFile[];
  ignoredCount: number;
};

export type BridgeScene = {
  id: string;
  label: string;
  startIndex: number;
  endIndex: number;
  fileCount: number;
  firstFileName: string;
  lastFileName: string;
  representativeFileName: string;
  needsReview: boolean;
};

export type BridgeAnalyzedJpgFile = BridgeJpgFile & {
  mtime: number;
  timestampSource: TimestampSource;
  visualFeatures: LocalVisualFeatures;
};

export type BridgeSceneAnalysis = {
  files: BridgeAnalyzedJpgFile[];
  boundaries: SceneBoundaryDecision[];
  scenes: BridgeScene[];
};

function extensionOf(name: string) {
  return name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
}

export function bridgeFileKind(name: string): BridgeFileKind {
  if (isHiddenSystemFile(name)) return "other";
  const extension = extensionOf(name);
  if (CAMERA_JPG_EXTENSIONS.has(extension)) return "jpg";
  if (RAW_PHOTO_EXTENSIONS.has(extension)) return "raw";
  if (BRIDGE_SIDECAR_EXTENSIONS.has(extension)) return "sidecar";
  return "other";
}

export function partitionBridgeFileNames(names: readonly string[]) {
  const jpg: string[] = [];
  const raw: string[] = [];
  const sidecar: string[] = [];
  const other: string[] = [];
  for (const name of names) {
    const kind = bridgeFileKind(name);
    (kind === "jpg" ? jpg : kind === "raw" ? raw : kind === "sidecar" ? sidecar : other).push(name);
  }
  return { jpg, raw, sidecar, other };
}

const naturalSort = (left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name, "ko", {
  numeric: true,
  sensitivity: "base",
});

export async function scanBridgeFolder(directory: FileSystemDirectoryHandle, folderKey = directory.name): Promise<BridgeFolderScan> {
  const folders: FileSystemDirectoryHandle[] = [];
  const jpgs: BridgeJpgFile[] = [];
  const raws: BridgeRawFile[] = [];
  const sidecars: BridgeSidecarFile[] = [];
  const fileHandles: Array<{ name: string; kind: "jpg" | "raw" | "sidecar"; handle: FileSystemFileHandle }> = [];
  let ignoredCount = 0;
  const iterable = directory as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  for await (const [name, handle] of iterable.entries()) {
    if (isHiddenSystemFile(name)) {
      ignoredCount += 1;
      continue;
    }
    if (handle.kind === "directory") {
      folders.push(handle as FileSystemDirectoryHandle);
      continue;
    }
    const kind = bridgeFileKind(name);
    if (kind === "other") {
      ignoredCount += 1;
      continue;
    }
    fileHandles.push({ name, kind, handle: handle as FileSystemFileHandle });
  }
  let cursor = 0;
  const workers = Array.from({ length: Math.min(16, Math.max(1, fileHandles.length)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= fileHandles.length) return;
      const { name, kind, handle } = fileHandles[index];
      const file = await handle.getFile();
      const normalizedName = name.normalize("NFC");
      const base = {
        id: `${folderKey.normalize("NFC")}:${normalizedName}:${file.size}:${file.lastModified}`,
        name: normalizedName,
        extension: extensionOf(name).toLocaleUpperCase("en-US"),
        handle,
        size: file.size,
        lastModified: file.lastModified,
      };
      if (kind === "jpg") jpgs.push({ ...base, file });
      else if (kind === "raw") raws.push(base);
      else sidecars.push(base);
    }
  });
  await Promise.all(workers);
  folders.sort(naturalSort);
  jpgs.sort(naturalSort);
  raws.sort(naturalSort);
  sidecars.sort(naturalSort);
  return { folders, jpgs, raws, sidecars, ignoredCount };
}

export function updateBridgeSelection(input: {
  current: ReadonlySet<string>;
  orderedIds: readonly string[];
  clickedId: string;
  anchorId: string | null;
  additive: boolean;
  range: boolean;
}) {
  const next = new Set(input.current);
  if (input.range && input.anchorId) {
    const anchorIndex = input.orderedIds.indexOf(input.anchorId);
    const clickedIndex = input.orderedIds.indexOf(input.clickedId);
    if (anchorIndex >= 0 && clickedIndex >= 0) {
      if (!input.additive) next.clear();
      const [start, end] = anchorIndex < clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
      for (let index = start; index <= end; index += 1) next.add(input.orderedIds[index]);
      return next;
    }
  }
  if (input.additive) {
    if (next.has(input.clickedId)) next.delete(input.clickedId);
    else next.add(input.clickedId);
  } else {
    next.clear();
    next.add(input.clickedId);
  }
  return next;
}

type TimestampedBridgeFile = BridgeJpgFile & {
  mtime: number;
  timestampSource: TimestampSource;
};

async function timestampBridgeFiles(
  jpgs: readonly BridgeJpgFile[],
  signal: AbortSignal | undefined,
  onProgress: ((completed: number, total: number, stage: string) => void) | undefined,
) {
  const output = new Array<TimestampedBridgeFile>(jpgs.length);
  let cursor = 0;
  let completed = 0;
  const workers = Array.from({ length: Math.min(4, Math.max(1, jpgs.length)) }, async () => {
    while (!signal?.aborted) {
      const index = cursor++;
      if (index >= jpgs.length) return;
      const entry = jpgs[index];
      const timestamp = await readPhotoTimestamp(entry.file);
      output[index] = {
        ...entry,
        mtime: timestamp?.timestamp ?? entry.lastModified,
        timestampSource: timestamp?.source ?? "mtime",
      };
      completed += 1;
      onProgress?.(completed, jpgs.length, "촬영시간 읽는 중");
    }
  });
  await Promise.all(workers);
  if (signal?.aborted) throw new DOMException("작업이 취소되었습니다.", "AbortError");
  return sortTimestampedFiles(output);
}

export async function analyzeBridgeScenes(input: {
  folderKey: string;
  jpgs: readonly BridgeJpgFile[];
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, stage: string) => void;
}): Promise<BridgeSceneAnalysis> {
  if (input.jpgs.length === 0) return { files: [], boundaries: [], scenes: [] };
  const files = await timestampBridgeFiles(input.jpgs, input.signal, input.onProgress);
  const settings = getClassificationSettings("default", "precise");
  const cacheKeys = files.map((entry) => featureCacheKey(input.folderKey, entry.file));
  const cached = await Promise.all(cacheKeys.map((key) => getCachedFeature(key)));
  const missingIndices = cached.flatMap((feature, index) => feature ? [] : [index]);
  const extracted = missingIndices.length ? await extractFeaturesWithWorkers({
    files: missingIndices.map((index) => files[index].file),
    concurrency: settings.maxConcurrentJobs,
    signal: input.signal,
    onProgress: (completed, total) => input.onProgress?.(completed, total, "화면 특징 분석 중"),
  }) : [];
  const features = [...cached] as Array<LocalVisualFeatures | null>;
  await Promise.all(extracted.map(async (result, offset) => {
    const index = missingIndices[offset];
    features[index] = result.features;
    if (result.features) await setCachedFeature(cacheKeys[index], result.features);
  }));
  if (input.signal?.aborted) throw new DOMException("작업이 취소되었습니다.", "AbortError");
  const blank: LocalVisualFeatures = {
    dHash: "0".repeat(64),
    colorHistogram: new Array(64).fill(0),
    backgroundGrid: new Array(24).fill(0),
    compositionGrid: new Array(16).fill(0),
    brightness: 0,
  };
  const firstValid = features.find((feature): feature is LocalVisualFeatures => Boolean(feature)) ?? blank;
  const safeFeatures = features.map((feature, index) => feature ?? features[index - 1] ?? firstValid);
  const analyzedFiles = files.map((file, index) => ({ ...file, visualFeatures: safeFeatures[index] }));
  input.onProgress?.(files.length, files.length, "Scene 계획 만드는 중");
  return rebuildBridgeSceneAnalysis(analyzedFiles);
}

export function rebuildBridgeSceneAnalysis(
  files: readonly BridgeAnalyzedJpgFile[],
): BridgeSceneAnalysis {
  if (files.length === 0) return { files: [], boundaries: [], scenes: [] };
  const settings = getClassificationSettings("default", "precise");
  const safeFeatures = files.map((file) => file.visualFeatures);
  const candidates = buildVisualBoundaryCandidates([...files], safeFeatures, settings);
  const decisions: SceneBoundaryDecision[] = candidates.map((candidate) => decideBoundary({
    candidate,
    analysis: null,
    settings,
    beforeFileName: files[candidate.boundaryIndex - 1].name,
    afterFileName: files[candidate.boundaryIndex].name,
    aiFailed: candidate.requiresAi,
  }));
  const stabilized = stabilizeBoundaries(decisions, files.length, settings.minimumSceneImages);
  const scenes = buildSceneRangesFromBoundaries(files.length, stabilized).map((range) => {
    const representativeIndex = Math.min(range.endIndex - 1, range.startIndex + Math.floor((range.endIndex - range.startIndex) / 2));
    return {
      id: `scene-${range.index}`,
      label: `Scene ${range.index}`,
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      fileCount: range.endIndex - range.startIndex,
      firstFileName: files[range.startIndex].name,
      lastFileName: files[range.endIndex - 1].name,
      representativeFileName: files[representativeIndex].name,
      needsReview: Boolean(range.boundaryBefore?.needsReview),
    };
  });
  return {
    files: [...files],
    boundaries: stabilized,
    scenes,
  };
}
