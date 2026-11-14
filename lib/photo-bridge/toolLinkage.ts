export type PhotoToolRatings = Record<string, number>;
export type PhotoToolColorLabels = Record<string, 6 | 7 | 8 | 9>;
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

/**
 * 사진 도구 사이에서 하위 폴더까지 보존하는 선택 식별자다.
 * basename-only 레거시 입력은 기존 키와 같고, 경로 입력은 각 폴더의 동명 파일을 구분한다.
 */
export function normalizePhotoToolSelectionKey(name: string): string {
  const segments = name
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) return "";
  const leaf = segments.pop()!.replace(/\.[^.]+$/, "");
  return [...segments, leaf]
    .join("/")
    .normalize("NFC")
    .toLocaleLowerCase("en-US");
}

export function normalizePhotoToolSelectionNames(names: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim().normalize("NFC");
    const key = normalizePhotoToolSelectionKey(trimmed);
    if (key && !unique.has(key)) unique.set(key, trimmed);
  }
  return [...unique.values()];
}

export function samePhotoToolSelectionNames(left: readonly string[], right: readonly string[]): boolean {
  const leftKeys = normalizePhotoToolSelectionNames(left).map(normalizePhotoToolSelectionKey).sort();
  const rightKeys = normalizePhotoToolSelectionNames(right).map(normalizePhotoToolSelectionKey).sort();
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
    const key = normalizePhotoToolSelectionKey(name);
    if (!key || rawRating === null || rawRating === undefined || !Number.isFinite(rawRating)) continue;
    const rating = Math.max(0, Math.min(5, Math.trunc(rawRating)));
    if (!options.overwrite && Object.hasOwn(next, key)) continue;
    if (rating === 0) delete next[key];
    else next[key] = rating;
  }
  return next;
}

export function mergePhotoToolColorLabels(
  current: Readonly<PhotoToolColorLabels>,
  incoming: Readonly<Record<string, number | null | undefined>>,
  options: { overwrite?: boolean } = {},
): PhotoToolColorLabels {
  const next = { ...current };
  for (const [name, rawLabel] of Object.entries(incoming)) {
    const key = normalizePhotoToolSelectionKey(name);
    if (!key || rawLabel === null || rawLabel === undefined || !Number.isFinite(rawLabel)) continue;
    const label = Math.trunc(rawLabel);
    if (!options.overwrite && Object.hasOwn(next, key)) continue;
    if (label === 6 || label === 7 || label === 8 || label === 9) next[key] = label;
    else delete next[key];
  }
  return next;
}
