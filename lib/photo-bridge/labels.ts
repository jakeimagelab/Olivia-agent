import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

export const BRIDGE_COLOR_LABELS = {
  6: { name: "빨강", color: "#e45d55" },
  7: { name: "노랑", color: "#d9ad3b" },
  8: { name: "초록", color: "#37c39d" },
  9: { name: "파랑", color: "#5c7cbe" },
} as const;

export type BridgeColorLabel = keyof typeof BRIDGE_COLOR_LABELS;
export type BridgeColorLabels = Record<string, BridgeColorLabel>;
export type BridgeRating = 1 | 2 | 3 | 4 | 5;
export type BridgeRatingEdit = 0 | BridgeRating;
export type BridgeRatingEdits = Record<string, BridgeRatingEdit>;
export type BridgeLabelFilter =
  | { kind: "rating"; rating: BridgeRating }
  | { kind: "color"; label: BridgeColorLabel };
export type BridgeLabelFilterCommand = BridgeLabelFilter | { kind: "all" };
export type BridgeLabelFilters = {
  rating: BridgeRating | null;
  color: BridgeColorLabel | null;
};
export type BridgeSelectionView = "starred" | "colored" | "selected" | "unselected";

export const EMPTY_BRIDGE_LABEL_FILTERS: BridgeLabelFilters = {
  rating: null,
  color: null,
};

export function updateBridgeRatings(
  current: Readonly<Record<string, number>>,
  targetIds: ReadonlySet<string>,
  rating: number,
) {
  if (!targetIds.size) return current;
  const next = { ...current };
  for (const id of targetIds) {
    if (rating === 0) delete next[id];
    else next[id] = rating;
  }
  return next;
}

export function updateBridgeRatingEdits(
  current: Readonly<BridgeRatingEdits>,
  targetIds: ReadonlySet<string>,
  rating: number,
): BridgeRatingEdits {
  if (!targetIds.size || !Number.isInteger(rating) || rating < 0 || rating > 5) return current;
  const next = { ...current };
  for (const id of targetIds) next[id] = rating as BridgeRatingEdit;
  return next;
}

export function normalizeBridgeRatingEdits(value: unknown): BridgeRatingEdits {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const edits: BridgeRatingEdits = {};
  for (const [id, rating] of Object.entries(value)) {
    if (Number.isInteger(rating) && Number(rating) >= 0 && Number(rating) <= 5) {
      edits[id] = Number(rating) as BridgeRatingEdit;
    }
  }
  return edits;
}

/** Adobe 값과 앱 편집값을 분리하고, 앱의 0점도 명시적인 해제 상태로 유지한다. */
export function resolveBridgeRatings(
  source: BridgeSelectionSource,
  base: Readonly<Record<string, number>>,
  adobe: Readonly<Record<string, number>>,
  edits: Readonly<BridgeRatingEdits>,
) {
  const next = source === "olivia" ? { ...base } : { ...base, ...adobe };
  for (const [id, rating] of Object.entries(edits)) {
    if (rating === 0) delete next[id];
    else next[id] = rating;
  }
  return next;
}

export function isBridgeColorLabel(value: unknown): value is BridgeColorLabel {
  return value === 6 || value === 7 || value === 8 || value === 9;
}

export function normalizeBridgeColorLabels(value: unknown): BridgeColorLabels {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const labels: BridgeColorLabels = {};
  for (const [id, label] of Object.entries(value)) {
    if (isBridgeColorLabel(label)) labels[id] = label;
  }
  return labels;
}

export function toggleBridgeColorLabel(
  current: BridgeColorLabels,
  targetIds: ReadonlySet<string>,
  label: BridgeColorLabel,
): BridgeColorLabels {
  if (!targetIds.size) return current;
  const shouldClear = [...targetIds].every((id) => current[id] === label);
  const next = { ...current };
  for (const id of targetIds) {
    if (shouldClear) delete next[id];
    else next[id] = label;
  }
  return next;
}

export function hasBridgeLabel(
  id: string,
  ratings: Readonly<Record<string, number>>,
  colorLabels: Readonly<BridgeColorLabels>,
) {
  return Boolean(ratings[id]) || isBridgeColorLabel(colorLabels[id]);
}

export function countBridgeLabeledFiles(
  ids: readonly string[],
  ratings: Readonly<Record<string, number>>,
  colorLabels: Readonly<BridgeColorLabels>,
) {
  return ids.reduce((count, id) => count + (hasBridgeLabel(id, ratings, colorLabels) ? 1 : 0), 0);
}

export function matchesBridgeSelectionView(
  id: string,
  view: BridgeSelectionView,
  ratings: Readonly<Record<string, number>>,
  colorLabels: Readonly<BridgeColorLabels>,
) {
  const hasStar = Boolean(ratings[id]);
  const hasColor = isBridgeColorLabel(colorLabels[id]);
  if (view === "starred") return hasStar;
  if (view === "colored") return hasColor;
  if (view === "selected") return hasStar || hasColor;
  return !hasStar && !hasColor;
}

export function bridgeLabelFilterCommandFromShortcutCode(code: string): BridgeLabelFilterCommand | null {
  if (code === "KeyA") return { kind: "all" };
  const match = /^Digit([1-9])$/.exec(code);
  if (!match) return null;
  const value = Number(match[1]);
  if (value >= 1 && value <= 5) return { kind: "rating", rating: value as BridgeRating };
  if (isBridgeColorLabel(value)) return { kind: "color", label: value };
  return null;
}

export function matchesBridgeLabelFilter(
  id: string,
  filter: BridgeLabelFilter,
  ratings: Readonly<Record<string, number>>,
  colorLabels: Readonly<BridgeColorLabels>,
) {
  if (filter.kind === "rating") return (ratings[id] ?? 0) >= filter.rating;
  return colorLabels[id] === filter.label;
}

export function bridgeLabelFilterName(filter: BridgeLabelFilter) {
  if (filter.kind === "rating") return `★${filter.rating} 이상`;
  return BRIDGE_COLOR_LABELS[filter.label].name;
}

export function updateBridgeLabelFilters(
  current: Readonly<BridgeLabelFilters>,
  command: BridgeLabelFilterCommand,
): BridgeLabelFilters {
  if (command.kind === "all") return { ...EMPTY_BRIDGE_LABEL_FILTERS };
  if (command.kind === "rating") {
    return {
      ...current,
      rating: current.rating === command.rating ? null : command.rating,
    };
  }
  return {
    ...current,
    color: current.color === command.label ? null : command.label,
  };
}

export function hasActiveBridgeLabelFilters(filters: Readonly<BridgeLabelFilters>) {
  return filters.rating !== null || filters.color !== null;
}

export function matchesBridgeLabelFilters(
  id: string,
  filters: Readonly<BridgeLabelFilters>,
  ratings: Readonly<Record<string, number>>,
  colorLabels: Readonly<BridgeColorLabels>,
) {
  if (filters.rating !== null && (ratings[id] ?? 0) < filters.rating) return false;
  if (filters.color !== null && colorLabels[id] !== filters.color) return false;
  return true;
}

export function bridgeFilenameSearchTokens(query: string) {
  return [...new Set(query
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .split(/[,\s]+/u)
    .map((token) => token.trim())
    .filter(Boolean))];
}

export function matchesBridgeFilenameSearch(fileName: string, query: string | readonly string[]) {
  const tokens = typeof query === "string" ? bridgeFilenameSearchTokens(query) : query;
  if (!tokens.length) return true;
  const normalized = fileName.normalize("NFC").toLocaleLowerCase("en-US");
  return tokens.some((token) => normalized.includes(token.normalize("NFC").toLocaleLowerCase("en-US")));
}
