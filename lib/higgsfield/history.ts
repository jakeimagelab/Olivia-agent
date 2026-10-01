import type { VideoGenerationRecord } from "./types";

export const VIDEO_GENERATION_HISTORY_KEY = "olivia.video-production.history.v1";
const MAX_HISTORY_ITEMS = 32;

function isRecord(value: unknown): value is VideoGenerationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<VideoGenerationRecord>;
  return typeof record.requestId === "string" && typeof record.model === "string" && typeof record.modelLabel === "string" && typeof record.status === "string" && typeof record.createdAt === "string" && typeof record.updatedAt === "string";
}

export function readVideoGenerationHistory(): VideoGenerationRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(VIDEO_GENERATION_HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecord).slice(0, MAX_HISTORY_ITEMS) : [];
  } catch {
    return [];
  }
}

export function writeVideoGenerationHistory(records: VideoGenerationRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIDEO_GENERATION_HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // 브라우저 저장 공간이 제한돼도 현재 생성 UX는 계속 동작해야 한다.
  }
}

export function upsertVideoGenerationHistory(records: VideoGenerationRecord[], record: VideoGenerationRecord): VideoGenerationRecord[] {
  const next = [record, ...records.filter((item) => item.requestId !== record.requestId)]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_HISTORY_ITEMS);
  writeVideoGenerationHistory(next);
  return next;
}
