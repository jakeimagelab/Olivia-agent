import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";
import {
  isFileSystemNotFoundError,
  readBridgeMarkEmbedded,
  readBridgeMarkSidecar,
} from "@/lib/selectMatch/bridgeMarkReader";
import type {
  AdobeBridgeMark,
  AdobeBridgeMarksProgress,
  AdobeBridgeMarksResult,
  AdobeBridgeRatingCandidate,
} from "@/lib/selectMatch/bridgeMarkTypes";

async function resolveRatingDirectory(
  root: FileSystemDirectoryHandle,
  relativeDirectory: string | undefined,
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of relativeDirectory?.split("/").filter(Boolean) ?? []) {
    let next: FileSystemDirectoryHandle | null = null;
    for (const candidate of [segment, segment.normalize("NFC"), segment.normalize("NFD")]) {
      try {
        next = await current.getDirectoryHandle(candidate);
        break;
      } catch (error) {
        if (!isFileSystemNotFoundError(error)) throw error;
      }
    }
    if (!next) {
      const iterable = current as FileSystemDirectoryHandle & {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      };
      for await (const [name, handle] of iterable.entries()) {
        if (handle.kind === "directory" && name.normalize("NFC") === segment.normalize("NFC")) {
          next = handle as FileSystemDirectoryHandle;
          break;
        }
      }
    }
    if (!next) throw new Error(`별점 폴더를 찾지 못했습니다: ${segment}`);
    current = next;
  }
  return current;
}

export async function collectAdobeBridgeMarks(
  directory: FileSystemDirectoryHandle,
  photos: readonly AdobeBridgeRatingCandidate[],
  options: {
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (progress: AdobeBridgeMarksProgress) => void;
  } = {},
): Promise<AdobeBridgeMarksResult> {
  const marks = new Map<string, AdobeBridgeMark>();
  const directoryCache = new Map<string, Promise<FileSystemDirectoryHandle>>();
  let cursor = 0;
  let read = 0;
  let rated = 0;
  let colored = 0;
  let failed = 0;
  let firstError: string | null = null;
  const failedFileNames: string[] = [];
  const concurrency = Math.min(Math.max(1, options.concurrency ?? 12), Math.max(1, photos.length));
  const report = (force = false) => {
    if (force || (read + failed) % 25 === 0) {
      options.onProgress?.({ read, total: photos.length, rated, colored, failed });
    }
  };
  const directoryFor = (photo: AdobeBridgeRatingCandidate) => {
    if (photo.parentHandle) return Promise.resolve(photo.parentHandle);
    const key = photo.relativeDirectory?.normalize("NFC") ?? "";
    const cached = directoryCache.get(key);
    if (cached) return cached;
    const resolved = resolveRatingDirectory(directory, photo.relativeDirectory);
    directoryCache.set(key, resolved);
    return resolved;
  };
  const worker = async () => {
    while (!options.signal?.aborted) {
      const index = cursor++;
      if (index >= photos.length) return;
      const photo = photos[index];
      const basename = photo.name.replace(/\.[^.]+$/, "");
      try {
        const ratingDirectory = await directoryFor(photo);
        const freshFile = photo.handle ? await photo.handle.getFile() : photo.file;
        const sidecar = await readBridgeMarkSidecar(ratingDirectory, basename);
        const embedded = freshFile
          ? await readBridgeMarkEmbedded(freshFile)
          : { rating: null, colorLabel: null };
        const mark = {
          rating: sidecar.rating ?? embedded.rating,
          colorLabel: sidecar.colorLabel ?? embedded.colorLabel,
        };
        if (mark.rating !== null || mark.colorLabel !== null) {
          marks.set(normalizePhotoToolFileKey(photo.name), mark);
        }
        if (mark.rating !== null) rated += 1;
        if (mark.colorLabel !== null) colored += 1;
        read += 1;
      } catch (error) {
        failed += 1;
        if (failedFileNames.length < 20) failedFileNames.push(photo.name);
        const message = error instanceof Error ? error.message : String(error);
        if (!firstError) {
          firstError = message;
          console.error(`[olivia-bridge] Adobe mark read failed for ${photo.name}`, error);
        }
      }
      report();
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (options.signal?.aborted) throw new DOMException("작업이 취소되었습니다.", "AbortError");
  report(true);
  return { marks, read, total: photos.length, rated, colored, failed, failedFileNames, firstError };
}

export async function collectAdobeBridgeRatings(
  directory: FileSystemDirectoryHandle,
  photos: readonly AdobeBridgeRatingCandidate[],
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<Map<string, number>> {
  const result = await collectAdobeBridgeMarks(directory, photos, options);
  return new Map(photos.flatMap((photo) => {
    const key = normalizePhotoToolFileKey(photo.name);
    const mark = result.marks.get(key);
    return mark?.rating === null || mark?.rating === undefined ? [] : [[key, mark.rating] as const];
  }));
}
