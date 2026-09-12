export type ContiFieldCardSize = "compact" | "normal" | "large";

export interface ContiSceneVisual {
  assetId?: string;
  imageUrl?: string;
  source: "library" | "custom" | "ai";
  sceneKey?: string;
}
export interface ContiSceneMeta {
  cameraAngle?: string;
  visual?: ContiSceneVisual;
}

export interface ContiExtraChecklistItem {
  id: string;
  label: string;
  notes?: string;
}

export interface ContiStudioState {
  version: 1;
  checklistCompleted: Record<string, boolean>;
  extraChecklistItems: ContiExtraChecklistItem[];
  scheduleStartTime?: string;
  fieldCardSize: ContiFieldCardSize;
  sceneMeta: Record<string, ContiSceneMeta>;
}

export function createDefaultContiStudioState(): ContiStudioState {
  return {
    version: 1,
    checklistCompleted: {},
    extraChecklistItems: [],
    fieldCardSize: "normal",
    sceneMeta: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeVisual(value: unknown): ContiSceneVisual | undefined {
  if (!isRecord(value) || !["library", "custom", "ai"].includes(String(value.source))) return undefined;
  const imageUrl = cleanText(value.imageUrl);
  if (imageUrl && !imageUrl.startsWith("/")) return undefined;
  return {
    source: value.source as ContiSceneVisual["source"],
    ...(cleanText(value.assetId) ? { assetId: cleanText(value.assetId) } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(cleanText(value.sceneKey) ? { sceneKey: cleanText(value.sceneKey) } : {}),
  };
}

export function normalizeContiStudioState(value: unknown): ContiStudioState {
  const fallback = createDefaultContiStudioState();
  if (!isRecord(value)) return fallback;

  const checklistCompleted: Record<string, boolean> = {};
  if (isRecord(value.checklistCompleted)) {
    for (const [key, completed] of Object.entries(value.checklistCompleted)) {
      if (key && typeof completed === "boolean") checklistCompleted[key] = completed;
    }
  }

  const extraChecklistItems: ContiExtraChecklistItem[] = [];
  const seenExtraIds = new Set<string>();
  if (Array.isArray(value.extraChecklistItems)) {
    for (const item of value.extraChecklistItems) {
      if (!isRecord(item)) continue;
      const id = cleanText(item.id);
      const label = cleanText(item.label);
      if (!id || !label || seenExtraIds.has(id)) continue;
      seenExtraIds.add(id);
      extraChecklistItems.push({ id, label, ...(cleanText(item.notes) ? { notes: cleanText(item.notes) } : {}) });
    }
  }

  const sceneMeta: Record<string, ContiSceneMeta> = {};
  if (isRecord(value.sceneMeta)) {
    for (const [sceneId, rawMeta] of Object.entries(value.sceneMeta)) {
      if (!sceneId || !isRecord(rawMeta)) continue;
      const cameraAngle = cleanText(rawMeta.cameraAngle);
      const visual = normalizeVisual(rawMeta.visual);
      if (cameraAngle || visual) sceneMeta[sceneId] = { ...(cameraAngle ? { cameraAngle } : {}), ...(visual ? { visual } : {}) };
    }
  }

  const fieldCardSize: ContiFieldCardSize = ["compact", "normal", "large"].includes(String(value.fieldCardSize))
    ? value.fieldCardSize as ContiFieldCardSize
    : "normal";
  const scheduleStartTime = typeof value.scheduleStartTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.scheduleStartTime)
    ? value.scheduleStartTime
    : undefined;

  return {
    version: 1,
    checklistCompleted,
    extraChecklistItems,
    ...(scheduleStartTime ? { scheduleStartTime } : {}),
    fieldCardSize,
    sceneMeta,
  };
}
