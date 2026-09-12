import type { ContiStudioState } from "@/lib/conti/studioState";

export interface ChecklistSceneInput {
  id: string;
  preparation_text?: string | null;
}
export interface DerivedContiChecklistItem {
  id: string;
  label: string;
  notes?: string;
  completed: boolean;
  linkedSceneIds: string[];
  source: "scene" | "manual";
}

function normalizeLabel(value: string): string {
  return value.replace(/^[□✓✔•·\-–—]\s*/, "").replace(/\s+/g, " ").trim();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createChecklistItemId(label: string): string {
  return `prep-${stableHash(normalizeLabel(label).toLocaleLowerCase("ko-KR"))}`;
}

export function parsePreparationText(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/[\n,;·]+/)
    .map(normalizeLabel)
    .filter(Boolean);
}

export function deriveContiChecklist(
  scenes: ChecklistSceneInput[],
  studioState: ContiStudioState,
): DerivedContiChecklistItem[] {
  const byKey = new Map<string, DerivedContiChecklistItem>();

  for (const scene of scenes) {
    for (const label of parsePreparationText(scene.preparation_text)) {
      const key = label.toLocaleLowerCase("ko-KR");
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.linkedSceneIds.includes(scene.id)) existing.linkedSceneIds.push(scene.id);
        continue;
      }
      const id = createChecklistItemId(label);
      byKey.set(key, {
        id,
        label,
        completed: Boolean(studioState.checklistCompleted[id]),
        linkedSceneIds: [scene.id],
        source: "scene",
      });
    }
  }

  for (const item of studioState.extraChecklistItems) {
    const key = normalizeLabel(item.label).toLocaleLowerCase("ko-KR");
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      if (item.notes && !existing.notes) existing.notes = item.notes;
      continue;
    }
    byKey.set(key, {
      id: item.id,
      label: normalizeLabel(item.label),
      ...(item.notes ? { notes: item.notes } : {}),
      completed: Boolean(studioState.checklistCompleted[item.id]),
      linkedSceneIds: [],
      source: "manual",
    });
  }

  return [...byKey.values()];
}
