import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";
import { readRatingEmbedded, readRatingSidecar } from "@/lib/selectMatch/bridgeRating";
import type { SelectMatchFolderGroup, SelectMatchPhoto } from "@/lib/selectMatch/folderScanner";

const RATING_READ_CONCURRENCY = 12;

async function mapPhotosWithConcurrency(
  groups: readonly SelectMatchFolderGroup[],
  transform: (photo: SelectMatchPhoto, group: SelectMatchFolderGroup) => Promise<SelectMatchPhoto>,
) {
  const nextGroups = groups.map((group) => ({ ...group, photos: [...group.photos] }));
  const positions = nextGroups.flatMap((group, groupIndex) => (
    group.photos.map((_, photoIndex) => ({ groupIndex, photoIndex }))
  ));
  let cursor = 0;

  const worker = async () => {
    while (cursor < positions.length) {
      const position = positions[cursor];
      cursor += 1;
      if (!position) return;
      const group = nextGroups[position.groupIndex];
      const photo = group?.photos[position.photoIndex];
      if (!group || !photo) continue;
      group.photos[position.photoIndex] = await transform(photo, group);
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(RATING_READ_CONCURRENCY, positions.length) },
    () => worker(),
  ));
  return nextGroups;
}

export function mergeSharedRatings(
  groups: readonly SelectMatchFolderGroup[],
  ratingsByName: Readonly<Record<string, number>>,
) {
  return groups.map((group) => ({
    ...group,
    photos: group.photos.map((photo) => {
      const sharedRating = ratingsByName[normalizePhotoToolFileKey(photo.name)];
      return sharedRating && sharedRating !== photo.rating ? { ...photo, rating: sharedRating } : photo;
    }),
  }));
}

export async function loadSidecarRatings(
  groups: readonly SelectMatchFolderGroup[],
  ratingsByName: Readonly<Record<string, number>>,
) {
  return mapPhotosWithConcurrency(groups, async (photo, group) => {
    const sharedRating = ratingsByName[normalizePhotoToolFileKey(photo.name)];
    return {
      ...photo,
      rating: sharedRating ?? await readRatingSidecar(group.dirHandle, photo.basename),
    };
  });
}

export async function loadEmbeddedRatings(groups: readonly SelectMatchFolderGroup[]) {
  return mapPhotosWithConcurrency(groups, async (photo) => {
    if (photo.rating !== null) return photo;
    try {
      const file = await photo.handle.getFile();
      return { ...photo, rating: await readRatingEmbedded(file) };
    } catch {
      return photo;
    }
  });
}

export function collectRatingsByName(groups: readonly SelectMatchFolderGroup[]) {
  return Object.fromEntries(groups.flatMap((group) => group.photos.flatMap((photo) => (
    photo.rating !== null && photo.rating >= 1 ? [[photo.name, photo.rating] as const] : []
  ))));
}

export function collectRatedBasenames(groups: readonly SelectMatchFolderGroup[], minRating = 1) {
  const names = new Set<string>();
  for (const group of groups) {
    for (const photo of group.photos) {
      if (photo.rating !== null && photo.rating >= minRating) names.add(photo.basename.toLowerCase());
    }
  }
  return names;
}
