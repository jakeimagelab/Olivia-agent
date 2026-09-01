import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";

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
