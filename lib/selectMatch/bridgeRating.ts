import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";
import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";

const BRIDGE_RATINGS_FILE = ".BridgeLabelsAndRatings";

export function readRatingFromXmpText(text: string): number | null {
  const match = text.match(/xmp:Rating[^>]*>\s*([1-5])\s*</i)
    ?? text.match(/xmp:Rating\s*=\s*["']([1-5])["']/i);
  return match ? Number(match[1]) : null;
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

function decodeXmlAttribute(value: string) {
  return value
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeXmlAttribute(match[2]) : null;
}

/** Adobe Bridge가 파일에 XMP를 쓸 수 없을 때 폴더에 저장하는 별점 목록. */
export function readBridgeRatingsManifestText(text: string): Map<string, number> {
  const ratings = new Map<string, number>();
  const section = text.match(/<ratings\b[^>]*>([\s\S]*?)<\/ratings>/i)?.[1];
  if (!section) return ratings;
  for (const match of section.matchAll(/<item\b[^>]*\/?>/gi)) {
    const key = xmlAttribute(match[0], "key")?.normalize("NFC").trim();
    const rawRating = Number(xmlAttribute(match[0], "rating"));
    if (!key || !Number.isInteger(rawRating) || rawRating < 1 || rawRating > 5) continue;
    ratings.set(key.toLocaleLowerCase("en-US"), rawRating);
  }
  return ratings;
}

async function readBridgeRatingsManifest(directory: FileSystemDirectoryHandle) {
  try {
    const handle = await directory.getFileHandle(BRIDGE_RATINGS_FILE);
    const file = await handle.getFile();
    return readBridgeRatingsManifestText(await file.text());
  } catch {
    return new Map<string, number>();
  }
}

export type AdobeBridgeRatingCandidate = {
  name: string;
  file?: File;
  handle?: FileSystemFileHandle;
  relativeDirectory?: string;
};

async function resolveRatingDirectory(
  root: FileSystemDirectoryHandle,
  relativeDirectory: string | undefined,
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of relativeDirectory?.split("/").filter(Boolean) ?? []) {
    current = await current.getDirectoryHandle(segment);
  }
  return current;
}

export async function collectAdobeBridgeRatings(
  directory: FileSystemDirectoryHandle,
  photos: readonly AdobeBridgeRatingCandidate[],
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<Map<string, number>> {
  const ratings = new Map<string, number>();
  const directoryCache = new Map<string, Promise<FileSystemDirectoryHandle>>();
  const manifestCache = new Map<string, Promise<Map<string, number>>>();
  let cursor = 0;
  const concurrency = Math.min(Math.max(1, options.concurrency ?? 12), Math.max(1, photos.length));

  const directoryFor = (relativeDirectory: string | undefined) => {
    const key = relativeDirectory?.normalize("NFC") ?? "";
    const cached = directoryCache.get(key);
    if (cached) return cached;
    const resolved = resolveRatingDirectory(directory, relativeDirectory);
    directoryCache.set(key, resolved);
    return resolved;
  };

  const manifestFor = (relativeDirectory: string | undefined) => {
    const key = relativeDirectory?.normalize("NFC") ?? "";
    const cached = manifestCache.get(key);
    if (cached) return cached;
    const manifest = directoryFor(relativeDirectory).then(readBridgeRatingsManifest);
    manifestCache.set(key, manifest);
    return manifest;
  };

  const worker = async () => {
    while (!options.signal?.aborted) {
      const index = cursor++;
      if (index >= photos.length) return;
      const photo = photos[index];
      const basename = photo.name.replace(/\.[^.]+$/, "");
      try {
        const ratingDirectory = await directoryFor(photo.relativeDirectory);
        const bridgeRatings = await manifestFor(photo.relativeDirectory);
        const freshFile = photo.handle ? await photo.handle.getFile() : photo.file;
        const normalizedName = photo.name.normalize("NFC").toLocaleLowerCase("en-US");
        const normalizedBasename = basename.normalize("NFC").toLocaleLowerCase("en-US");
        const rating = bridgeRatings.get(normalizedName)
          ?? bridgeRatings.get(normalizedBasename)
          ?? await readRatingSidecar(ratingDirectory, basename)
          ?? (freshFile ? await readRatingEmbedded(freshFile) : null);
        if (rating !== null) ratings.set(normalizePhotoToolFileKey(photo.name), rating);
      } catch {
        // 외부 앱이 파일을 갱신하는 순간 잠시 읽을 수 없는 항목은 건너뛰고
        // 다음 창 포커스 때 다시 동기화한다.
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (options.signal?.aborted) throw new DOMException("작업이 취소되었습니다.", "AbortError");
  return ratings;
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
