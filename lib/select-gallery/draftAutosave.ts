export function shouldScheduleDraftAutosave(input: {
  readOnly: boolean;
  dirty: boolean;
  conflictBlocked: boolean;
}) {
  return !input.readOnly && input.dirty && !input.conflictBlocked;
}

export function revisionFromConflictDraft(
  currentRevision: number,
  draft: { revision?: unknown } | null | undefined,
) {
  const revision = Number(draft?.revision);
  return Number.isInteger(revision) && revision >= 0 ? revision : currentRevision;
}
