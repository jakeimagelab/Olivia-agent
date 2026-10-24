export type BridgeGridDirection = "left" | "right" | "up" | "down";

export type BridgeGridItem = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function centerX(item: BridgeGridItem): number {
  return (item.left + item.right) / 2;
}

/**
 * Resolves keyboard movement from the cards' rendered positions. The Bridge
 * grid changes its column count whenever the window, panes, or thumbnail size
 * changes, so a fixed column count would become stale during normal use.
 */
export function bridgeGridNavigationTarget(input: {
  items: readonly BridgeGridItem[];
  currentId: string | null;
  direction: BridgeGridDirection;
}): string | null {
  if (!input.items.length) return null;
  const currentIndex = input.items.findIndex((item) => item.id === input.currentId);
  if (currentIndex < 0) return input.items[0]?.id ?? null;
  const resolvedIndex = currentIndex;

  if (input.direction === "left" || input.direction === "right") {
    const offset = input.direction === "left" ? -1 : 1;
    return input.items[Math.max(0, Math.min(input.items.length - 1, resolvedIndex + offset))]?.id ?? null;
  }

  const current = input.items[resolvedIndex];
  const verticalCandidates = input.items.filter((item) => (
    input.direction === "up"
      ? item.top < current.top - 1
      : item.top > current.top + 1
  ));
  if (!verticalCandidates.length) return current.id;

  let closestRowDistance = Number.POSITIVE_INFINITY;
  for (const item of verticalCandidates) {
    closestRowDistance = Math.min(closestRowDistance, Math.abs(item.top - current.top));
  }

  const rowTolerance = 2;
  const closestRow = verticalCandidates.filter((item) => (
    Math.abs(Math.abs(item.top - current.top) - closestRowDistance) <= rowTolerance
  ));
  let best = closestRow[0];
  let bestHorizontalDistance = Math.abs(centerX(best) - centerX(current));
  for (const item of closestRow.slice(1)) {
    const horizontalDistance = Math.abs(centerX(item) - centerX(current));
    if (horizontalDistance < bestHorizontalDistance) {
      best = item;
      bestHorizontalDistance = horizontalDistance;
    }
  }
  return best?.id ?? current.id;
}
