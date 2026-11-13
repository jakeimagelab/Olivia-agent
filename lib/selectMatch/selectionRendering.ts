export function hasSceneSelectionDifference(
  photos: readonly { basename: string }[],
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>,
) {
  if (previous === next) return false;
  for (const photo of photos) {
    const key = photo.basename.toLowerCase();
    if (previous.has(key) !== next.has(key)) return true;
  }
  return false;
}
