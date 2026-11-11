import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";
import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";
import { PERSON_SELECT_RAW_LABEL_NAMES, type PersonSelectRawColorLabel } from "@/lib/person-select/rawMatch";

export type AdobeBridgeMark = { rating: number | null; colorLabel: PersonSelectRawColorLabel | null };

export function readRatingFromXmpText(text: string): number | null {
  const match = text.match(/xmp:Rating[^>]*>\s*([1-5])\s*</i)
    ?? text.match(/xmp:Rating\s*=\s*["']([1-5])["']/i);
  return match ? Number(match[1]) : null;
}

export function readColorLabelFromXmpText(text: string): PersonSelectRawColorLabel | null {
  const oliviaCode = text.match(/olivia:ColorCode[^>]*>\s*([6-9])\s*</i)
    ?? text.match(/olivia:ColorCode\s*=\s*["']([6-9])["']/i);
  if (oliviaCode) return Number(oliviaCode[1]) as PersonSelectRawColorLabel;
  const match = text.match(/xmp:Label[^>]*>\s*([^<]+?)\s*</i)
    ?? text.match(/xmp:Label\s*=\s*["']([^"']+)["']/i);
  if (!match) return null;
  const label = match[1].trim().toLocaleLowerCase("en-US");
  const found = ([6, 7, 8, 9] as const).find((value) => PERSON_SELECT_RAW_LABEL_NAMES[value].toLocaleLowerCase("en-US") === label);
  return found ?? null;
}

export function readBridgeMarkFromXmpText(text: string): AdobeBridgeMark {
  return { rating: readRatingFromXmpText(text), colorLabel: readColorLabelFromXmpText(text) };
}

export async function readBridgeMarkSidecar(directory: FileSystemDirectoryHandle, basename: string): Promise<AdobeBridgeMark> {
  for (const extension of [".xmp", ".XMP"]) {
    try {
      const handle = await directory.getFileHandle(`${basename}${extension}`);
      const file = await handle.getFile();
      return readBridgeMarkFromXmpText(await file.text());
    } catch {
      // 대소문자 확장자를 순서대로 확인한다.
    }
  }
  return { rating: null, colorLabel: null };
}

export async function readRatingSidecar(
  directory: FileSystemDirectoryHandle,
  basename: string,
): Promise<number | null> {
  for (const extension of [".xmp", ".XMP"]) {
    try {
      const handle = await directory.getFileHandle(`${basename}${extension}`);
      const file = await handle.getFile();
      return readRatingFromXmpText(await file.text());
    } catch {
      // 대소문자 확장자를 순서대로 확인한다.
    }
  }
  return null;
}

export async function readRatingEmbedded(file: File): Promise<number | null> {
  try {
    const buffer = await file.slice(0, 131_072).arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const start = text.indexOf("<x:xmpmeta");
    if (start === -1) return null;
    const end = text.indexOf("</x:xmpmeta>", start);
    return readRatingFromXmpText(text.slice(start, end === -1 ? start + 4096 : end + 12));
  } catch {
    return null;
  }
}

export type AdobeBridgeRatingCandidate = {
  name: string;
  file?: File;
  handle?: FileSystemFileHandle;
  relativeDirectory?: string;
  parentHandle?: FileSystemDirectoryHandle;
};

async function resolveRatingDirectory(
  root: FileSystemDirectoryHandle,
  relativeDirectory: string | undefined,
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of relativeDirectory?.split("/").filter(Boolean) ?? []) {
    let next: FileSystemDirectoryHandle | null = null;
    for (const candidate of [segment, segment.normalize("NFC"), segment.normalize("NFD")]) {
      try { next = await current.getDirectoryHandle(candidate); break; } catch { /* 다른 유니코드 정규화를 확인한다. */ }
    }
    if (!next) {
      const iterable = current as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };
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
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<Map<string, AdobeBridgeMark>> {
  const marks = new Map<string, AdobeBridgeMark>();
  const directoryCache = new Map<string, Promise<FileSystemDirectoryHandle>>();
  let cursor = 0;
  const concurrency = Math.min(Math.max(1, options.concurrency ?? 12), Math.max(1, photos.length));
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
        const embeddedRating = sidecar.rating ?? (freshFile ? await readRatingEmbedded(freshFile) : null);
        const mark = { rating: embeddedRating, colorLabel: sidecar.colorLabel };
        if (mark.rating !== null || mark.colorLabel !== null) marks.set(normalizePhotoToolFileKey(photo.name), mark);
      } catch {
        // 다음 창 포커스 때 다시 동기화한다.
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (options.signal?.aborted) throw new DOMException("작업이 취소되었습니다.", "AbortError");
  return marks;
}

export async function collectAdobeBridgeRatings(
  directory: FileSystemDirectoryHandle,
  photos: readonly AdobeBridgeRatingCandidate[],
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<Map<string, number>> {
  const marks = await collectAdobeBridgeMarks(directory, photos, options);
  return new Map([...marks].flatMap(([key, mark]) => mark.rating === null ? [] : [[key, mark.rating] as const]));
}

export async function collectBridgeSidecarRatedNames(
  groups: SelectMatchFolderGroup[],
  minRating = 1,
): Promise<{ names: Set<string>; scanned: number; rated: number }> {
  const photos = groups.flatMap((group) => group.photos.map((photo) => ({ group, photo })));
  const names = new Set<string>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < photos.length) {
      const current = photos[cursor++];
      const rating = await readRatingSidecar(current.group.dirHandle, current.photo.basename);
      if (rating !== null && rating >= minRating) names.add(current.photo.basename.toLowerCase());
    }
  };

  await Promise.all(Array.from({ length: Math.min(12, photos.length) }, () => worker()));
  return { names, scanned: photos.length, rated: names.size };
}
