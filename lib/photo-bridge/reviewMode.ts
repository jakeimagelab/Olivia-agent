export type BridgeReviewLayout = "single" | "grid" | "deck";

export type BridgeReviewRemovedItem = {
  id: string;
  orderIndex: number;
};

export function bridgeReviewLayout(count: number): BridgeReviewLayout {
  if (count <= 1) return "single";
  if (count <= 4) return "grid";
  return "deck";
}

export function bridgeKeyboardRangeSelection(input: {
  orderedIds: readonly string[];
  anchorId: string;
  targetId: string;
}) {
  const anchorIndex = input.orderedIds.indexOf(input.anchorId);
  const targetIndex = input.orderedIds.indexOf(input.targetId);
  if (anchorIndex < 0 || targetIndex < 0) return new Set<string>();
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return new Set(input.orderedIds.slice(start, end + 1));
}

export function cycleBridgeReviewIndex(currentIndex: number, count: number, delta: -1 | 1) {
  if (count <= 0) return -1;
  const current = currentIndex >= 0 ? currentIndex : 0;
  return (current + delta + count) % count;
}

export function removeBridgeReviewItem(orderedIds: readonly string[], activeId: string | null) {
  if (!activeId) return { remainingIds: [...orderedIds], nextActiveId: orderedIds[0] ?? null, removed: null };
  const activeIndex = orderedIds.indexOf(activeId);
  if (activeIndex < 0) return { remainingIds: [...orderedIds], nextActiveId: orderedIds[0] ?? null, removed: null };
  const remainingIds = orderedIds.filter((id) => id !== activeId);
  return {
    remainingIds,
    nextActiveId: remainingIds[Math.min(activeIndex, Math.max(0, remainingIds.length - 1))] ?? null,
    removed: { id: activeId, orderIndex: activeIndex } satisfies BridgeReviewRemovedItem,
  };
}

export function restoreBridgeReviewItem(orderedIds: readonly string[], removed: BridgeReviewRemovedItem | null) {
  if (!removed || orderedIds.includes(removed.id)) return { restoredIds: [...orderedIds], activeId: null };
  const restoredIds = [...orderedIds];
  restoredIds.splice(Math.min(Math.max(0, removed.orderIndex), restoredIds.length), 0, removed.id);
  return { restoredIds, activeId: removed.id };
}

/** Returns at most seven circular neighbors for the layered review deck. */
export function bridgeReviewDeckWindow<T>(items: readonly T[], activeIndex: number) {
  if (!items.length || activeIndex < 0) return [] as Array<{ item: T; offset: number }>;
  const count = Math.min(items.length, 7);
  const start = -Math.floor((count - 1) / 2);
  return Array.from({ length: count }, (_, index) => {
    const offset = start + index;
    const itemIndex = (activeIndex + offset + items.length) % items.length;
    return { item: items[itemIndex], offset };
  });
}
