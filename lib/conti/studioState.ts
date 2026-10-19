export type ContiFieldCardSize = "compact" | "normal" | "large";
export interface ContiSceneVisual { assetId?: string; imageUrl?: string; source: "library" | "custom" | "ai"; sceneKey?: string }
export interface ContiSceneMeta { cameraAngle?: string; visual?: ContiSceneVisual }
export interface ContiExtraChecklistItem { id: string; label: string; notes?: string }
export interface ContiScheduleSegment { id: string; label: string; date?: string; startTime?: string; endTime?: string }
export interface ContiScheduleBlock { id: string; segmentId: string; type: "break"; label: string; minutes: number; startTime?: string; location?: string }
export interface ContiFixedSceneTime { segmentId: string; startTime: string }

export interface ContiStudioState {
  version: 2;
  checklistCompleted: Record<string, boolean>;
  checklistAssignees: Record<string, string>;
  extraChecklistItems: ContiExtraChecklistItem[];
  scheduleStartTime?: string;
  scheduleSegments: ContiScheduleSegment[];
  scheduleBlocks: ContiScheduleBlock[];
  fixedSceneTimes: Record<string, ContiFixedSceneTime>;
  timelineOrder: string[];
  timelineCompleted: Record<string, boolean>;
  hospitalRequestNote: string;
  fieldCardSize: ContiFieldCardSize;
  sceneMeta: Record<string, ContiSceneMeta>;
}

export function createDefaultContiStudioState(): ContiStudioState {
  return { version: 2, checklistCompleted: {}, checklistAssignees: {}, extraChecklistItems: [], scheduleSegments: [{ id: "day-1", label: "1일차", startTime: "09:00", endTime: "18:00" }], scheduleBlocks: [], fixedSceneTimes: {}, timelineOrder: [], timelineCompleted: {}, hospitalRequestNote: "", fieldCardSize: "normal", sceneMeta: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function cleanText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function cleanTime(value: unknown): string | undefined { return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : undefined; }

function normalizeVisual(value: unknown): ContiSceneVisual | undefined {
  if (!isRecord(value) || !["library", "custom", "ai"].includes(String(value.source))) return undefined;
  const imageUrl = cleanText(value.imageUrl);
  if (imageUrl && !imageUrl.startsWith("/")) return undefined;
  return { source: value.source as ContiSceneVisual["source"], ...(cleanText(value.assetId) ? { assetId: cleanText(value.assetId) } : {}), ...(imageUrl ? { imageUrl } : {}), ...(cleanText(value.sceneKey) ? { sceneKey: cleanText(value.sceneKey) } : {}) };
}

function normalizeBooleanRecord(value: unknown): Record<string, boolean> {
  const output: Record<string, boolean> = {};
  if (isRecord(value)) for (const [key, entry] of Object.entries(value)) if (key && typeof entry === "boolean") output[key] = entry;
  return output;
}

function normalizeTextRecord(value: unknown): Record<string, string> {
  const output: Record<string, string> = {};
  if (isRecord(value)) for (const [key, entry] of Object.entries(value)) { const text = cleanText(entry); if (key && text) output[key] = text; }
  return output;
}

export function normalizeContiStudioState(value: unknown): ContiStudioState {
  const fallback = createDefaultContiStudioState();
  if (!isRecord(value)) return fallback;
  const extraChecklistItems: ContiExtraChecklistItem[] = [];
  const seenExtraIds = new Set<string>();
  if (Array.isArray(value.extraChecklistItems)) for (const item of value.extraChecklistItems) {
    if (!isRecord(item)) continue;
    const id = cleanText(item.id); const label = cleanText(item.label);
    if (!id || !label || seenExtraIds.has(id)) continue;
    seenExtraIds.add(id); extraChecklistItems.push({ id, label, ...(cleanText(item.notes) ? { notes: cleanText(item.notes) } : {}) });
  }
  const sceneMeta: Record<string, ContiSceneMeta> = {};
  if (isRecord(value.sceneMeta)) for (const [sceneId, rawMeta] of Object.entries(value.sceneMeta)) {
    if (!sceneId || !isRecord(rawMeta)) continue;
    const cameraAngle = cleanText(rawMeta.cameraAngle); const visual = normalizeVisual(rawMeta.visual);
    if (cameraAngle || visual) sceneMeta[sceneId] = { ...(cameraAngle ? { cameraAngle } : {}), ...(visual ? { visual } : {}) };
  }
  const scheduleSegments: ContiScheduleSegment[] = [];
  if (Array.isArray(value.scheduleSegments)) for (const raw of value.scheduleSegments) {
    if (!isRecord(raw)) continue;
    const id = cleanText(raw.id); const label = cleanText(raw.label);
    if (!id || !label) continue;
    scheduleSegments.push({ id, label, ...(cleanText(raw.date) ? { date: cleanText(raw.date) } : {}), ...(cleanTime(raw.startTime) ? { startTime: cleanTime(raw.startTime) } : {}), ...(cleanTime(raw.endTime) ? { endTime: cleanTime(raw.endTime) } : {}) });
  }
  const legacyStart = cleanTime(value.scheduleStartTime);
  if (!scheduleSegments.length) scheduleSegments.push({ ...fallback.scheduleSegments[0], ...(legacyStart ? { startTime: legacyStart } : {}) });
  const scheduleBlocks: ContiScheduleBlock[] = [];
  if (Array.isArray(value.scheduleBlocks)) for (const raw of value.scheduleBlocks) {
    if (!isRecord(raw)) continue;
    const id = cleanText(raw.id); const segmentId = cleanText(raw.segmentId); const label = cleanText(raw.label); const minutes = Number(raw.minutes);
    if (!id || !segmentId || !label || !Number.isFinite(minutes) || minutes <= 0) continue;
    scheduleBlocks.push({ id, segmentId, type: "break", label, minutes, ...(cleanTime(raw.startTime) ? { startTime: cleanTime(raw.startTime) } : {}), ...(cleanText(raw.location) ? { location: cleanText(raw.location) } : {}) });
  }
  const fixedSceneTimes: Record<string, ContiFixedSceneTime> = {};
  if (isRecord(value.fixedSceneTimes)) for (const [sceneId, raw] of Object.entries(value.fixedSceneTimes)) {
    if (!isRecord(raw)) continue;
    const segmentId = cleanText(raw.segmentId); const startTime = cleanTime(raw.startTime);
    if (sceneId && segmentId && startTime) fixedSceneTimes[sceneId] = { segmentId, startTime };
  }
  const fieldCardSize: ContiFieldCardSize = ["compact", "normal", "large"].includes(String(value.fieldCardSize)) ? value.fieldCardSize as ContiFieldCardSize : "normal";
  const timelineOrder = Array.isArray(value.timelineOrder) ? value.timelineOrder.filter((entry): entry is string => typeof entry === "string" && Boolean(entry)) : [];
  return { version: 2, checklistCompleted: normalizeBooleanRecord(value.checklistCompleted), checklistAssignees: normalizeTextRecord(value.checklistAssignees), extraChecklistItems, ...(legacyStart ? { scheduleStartTime: legacyStart } : {}), scheduleSegments, scheduleBlocks, fixedSceneTimes, timelineOrder, timelineCompleted: normalizeBooleanRecord(value.timelineCompleted), hospitalRequestNote: cleanText(value.hospitalRequestNote) ?? "", fieldCardSize, sceneMeta };
}
