import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";
import { readRatingSidecar } from "@/lib/selectMatch/bridgeMarkReader";

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
