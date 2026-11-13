import type { SelectionSyncPatch } from "./selectionSync";

export function buildClassicChoiceSelectionPatches(input: {
  imageId: string;
  selectedIds: ReadonlySet<string>;
  limit: number;
  retouchKeys?: readonly string[];
  memo?: string;
}): { patches: SelectionSyncPatch[]; limitReached: boolean } {
  const limit = Math.max(1, input.limit);
  if (limit > 1 && input.selectedIds.size >= limit && !input.selectedIds.has(input.imageId)) {
    return { patches: [], limitReached: true };
  }
  const patches: SelectionSyncPatch[] = [];
  if (limit === 1) {
    for (const selectedId of input.selectedIds) {
      if (selectedId !== input.imageId) patches.push({ imageId: selectedId, selected: false });
    }
  }
  patches.push(
    { imageId: input.imageId, selected: true },
    { imageId: input.imageId, retouchKeys: [...(input.retouchKeys ?? [])] },
    { imageId: input.imageId, memo: input.memo ?? "" },
  );
  return { patches, limitReached: false };
}

export function buildClassicChoiceFeedbackPatches(
  imageId: string,
  retouchKeys: readonly string[],
  memo: string,
): SelectionSyncPatch[] {
  return [
    { imageId, retouchKeys: [...retouchKeys] },
    { imageId, memo },
  ];
}
