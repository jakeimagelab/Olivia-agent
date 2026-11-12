export type ClassicSelectionShortcut = "select" | "clear";

/** 기존 사진선택은 별점이 없는 선택/해제 방식이므로 1과 0만 단축키로 쓴다. */
export function resolveClassicSelectionShortcut(key: string): ClassicSelectionShortcut | null {
  if (key === "1") return "select";
  if (key === "0") return "clear";
  return null;
}

/** 서버 선택에서 저장 중인 낙관적 해제를 제외해 즉시 보이는 선택을 계산한다. */
export function resolveVisibleClassicSelectionIds(
  selectedIds: Iterable<string>,
  optimisticallyClearedIds: ReadonlySet<string>,
) {
  const visible = new Set<string>();
  for (const imageId of selectedIds) {
    if (!optimisticallyClearedIds.has(imageId)) visible.add(imageId);
  }
  return visible;
}

/** 빠른 연속 탭도 직전 낙관적 상태를 기준으로 선택/해제를 계산한다. */
export function toggleClassicSelectionId(selectedIds: ReadonlySet<string>, imageId: string) {
  const next = new Set(selectedIds);
  const selected = !next.has(imageId);
  if (selected) next.add(imageId);
  else next.delete(imageId);
  return { selectedIds: next, selected };
}
