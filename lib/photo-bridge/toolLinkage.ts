export type PhotoToolRatings = Record<string, number>;

export function normalizePhotoToolFileKey(name: string): string {
  const leaf = name.trim().split(/[\\/]/).at(-1) ?? "";
  return leaf
    .replace(/\.[^.]+$/, "")
    .normalize("NFC")
    .toLocaleLowerCase("en-US");
}

export function normalizePhotoToolSelectionNames(names: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim().normalize("NFC");
    const key = normalizePhotoToolFileKey(trimmed);
    if (key && !unique.has(key)) unique.set(key, trimmed);
  }
  return [...unique.values()];
}

export function samePhotoToolSelectionNames(left: readonly string[], right: readonly string[]): boolean {
  const leftKeys = normalizePhotoToolSelectionNames(left).map(normalizePhotoToolFileKey).sort();
  const rightKeys = normalizePhotoToolSelectionNames(right).map(normalizePhotoToolFileKey).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
}

export function mergePhotoToolSelectionSources(...sources: ReadonlySet<string>[]): Set<string> {
  return new Set(sources.flatMap((source) => [...source]));
}

export function mergePhotoToolRatings(
  current: Readonly<PhotoToolRatings>,
  incoming: Readonly<Record<string, number | null | undefined>>,
  options: { overwrite?: boolean } = {},
): PhotoToolRatings {
  const next = { ...current };
  for (const [name, rawRating] of Object.entries(incoming)) {
    const key = normalizePhotoToolFileKey(name);
    if (!key || rawRating === null || rawRating === undefined || !Number.isFinite(rawRating)) continue;
    const rating = Math.max(0, Math.min(5, Math.trunc(rawRating)));
    if (!options.overwrite && Object.hasOwn(next, key)) continue;
    if (rating === 0) delete next[key];
    else next[key] = rating;
  }
  return next;
}
