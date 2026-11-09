export type PhotoToolRatings = Record<string, number>;
export type BridgeSelectionSource = "olivia" | "adobe" | "both";

export const DEFAULT_BRIDGE_SELECTION_SOURCE: BridgeSelectionSource = "olivia";

export function normalizeBridgeSelectionSource(value: unknown): BridgeSelectionSource {
  return value === "adobe" || value === "both" ? value : DEFAULT_BRIDGE_SELECTION_SOURCE;
}

export function resolveBridgeSelection(
  source: BridgeSelectionSource,
  manual: ReadonlySet<string>,
  adobe: ReadonlySet<string>,
  manualRemoved: ReadonlySet<string> = new Set(),
): Set<string> {
  if (source === "olivia") return new Set(manual);
  if (source === "adobe") return new Set(adobe);
  return new Set([...manual, ...adobe].filter((id) => !manualRemoved.has(id)));
}

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
