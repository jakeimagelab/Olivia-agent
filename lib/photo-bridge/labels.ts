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
export type BridgeSelectionView = "starred" | "colored" | "selected" | "unselected";

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
  base: Readonly<Record<string, number>>,
  adobe: Readonly<Record<string, number>>,
  edits: Readonly<BridgeRatingEdits>,
) {
  const next = { ...base, ...adobe };
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
  if (filter.kind === "rating") return ratings[id] === filter.rating;
  return colorLabels[id] === filter.label;
}

export function bridgeLabelFilterName(filter: BridgeLabelFilter) {
  if (filter.kind === "rating") return `별점 ${filter.rating}`;
  return BRIDGE_COLOR_LABELS[filter.label].name;
}
