import { CAMERA_JPG_EXTENSIONS } from "@/lib/photo/extensions";
import { buildQuickProposals } from "./browserProcessing";
import type { LocalVisualFeatures } from "./hybrid-types";
import {
  computeFolderStats,
  type FolderShootingPattern,
  type FolderStats,
  type SceneProposal,
} from "./pattern-analysis";
import {
  featureCacheKey,
  folderFingerprint,
  getCachedFeature,
  getCachedPattern,
  setCachedPattern,
} from "./scene-cache";
import { readPhotoTimestamp } from "./timestamp";
import type { MedicalDepartment } from "./types";

export type FieldFolderScanEntry = {
  name: string;
  mtime: number;
  file: File;
};

async function requestFolderPattern(
  department: MedicalDepartment,
  stats: FolderStats,
): Promise<FolderShootingPattern> {
  const response = await fetch("/api/photo-classification-pattern", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ department, stats }),
  });
  const data = await response.json() as {
    ok?: boolean;
    error?: string;
    pattern?: FolderShootingPattern;
  };
  if (!response.ok || !data.ok || !data.pattern) {
    throw new Error(data.error ?? "폴더 분석 실패");
  }
  return data.pattern;
}

export async function analyzeBrowserFieldFolder({
  rootDirectory,
  department,
  fallbackGapMinutes,
  timestampReader = readPhotoTimestamp,
  getPattern = getCachedPattern,
  setPattern = setCachedPattern,
  getFeature = getCachedFeature,
  requestPattern = requestFolderPattern,
  proposalBuilder = buildQuickProposals,
}: {
  rootDirectory: FileSystemDirectoryHandle;
  department: MedicalDepartment;
  fallbackGapMinutes: number;
  timestampReader?: typeof readPhotoTimestamp;
  getPattern?: <T>(fingerprint: string) => Promise<T | null>;
  setPattern?: <T>(fingerprint: string, pattern: T) => Promise<void>;
  getFeature?: (key: string) => Promise<LocalVisualFeatures | null>;
  requestPattern?: (department: MedicalDepartment, stats: FolderStats) => Promise<FolderShootingPattern>;
  proposalBuilder?: typeof buildQuickProposals;
}): Promise<{
  entries: FieldFolderScanEntry[];
  pattern: FolderShootingPattern | null;
  proposals: SceneProposal[];
  fromCache: boolean;
}> {
  const entries: FieldFolderScanEntry[] = [];
  for await (const [name, handle] of (rootDirectory as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }).entries()) {
    if (handle.kind !== "file") continue;
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (!CAMERA_JPG_EXTENSIONS.has(extension)) continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    const timestamp = await timestampReader(file);
    entries.push({ name, mtime: timestamp?.timestamp ?? file.lastModified, file });
  }
  entries.sort((left, right) => left.mtime - right.mtime);
  if (!entries.length) return { entries, pattern: null, proposals: [], fromCache: false };

  const fingerprint = folderFingerprint(rootDirectory.name, entries.map((entry) => ({
    name: entry.name,
    size: entry.file.size,
    lastModified: entry.file.lastModified,
  })));
  const cachedPattern = await getPattern<FolderShootingPattern>(fingerprint);
  if (cachedPattern) {
    return {
      entries,
      pattern: cachedPattern,
      proposals: await proposalBuilder(entries, cachedPattern.profile.absoluteTimeGapMinutes ?? fallbackGapMinutes),
      fromCache: true,
    };
  }

  const cachedFeatures = (await Promise.all(entries.map((entry) => (
    getFeature(featureCacheKey(rootDirectory.name, entry.file))
  )))).filter((feature): feature is LocalVisualFeatures => Boolean(feature));
  const stats = computeFolderStats(entries.map((entry) => entry.mtime), cachedFeatures, 1);
  const pattern = await requestPattern(department, stats);
  await setPattern(fingerprint, pattern);
  return {
    entries,
    pattern,
    proposals: await proposalBuilder(entries, pattern.profile.absoluteTimeGapMinutes ?? fallbackGapMinutes),
    fromCache: false,
  };
}
