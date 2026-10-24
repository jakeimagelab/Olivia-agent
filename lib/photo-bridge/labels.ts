export const BRIDGE_COLOR_LABELS = {
  6: { name: "빨강", color: "#e45d55" },
  7: { name: "노랑", color: "#d9ad3b" },
  8: { name: "초록", color: "#37c39d" },
  9: { name: "파랑", color: "#5c7cbe" },
} as const;

export type BridgeColorLabel = keyof typeof BRIDGE_COLOR_LABELS;
export type BridgeColorLabels = Record<string, BridgeColorLabel>;

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
