import type { TranscriptSegment, VoiceSummary } from "@/lib/voice/types";

function trimmedString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function stringList(value: unknown, maxItems = 40, maxLength = 500): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => trimmedString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeTranscriptSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const text = trimmedString(row.text, 20_000);
    const speaker = trimmedString(row.speaker, 120) || "speaker_0";
    const start = typeof row.start === "number" && Number.isFinite(row.start) ? Math.max(0, row.start) : 0;
    const end = typeof row.end === "number" && Number.isFinite(row.end) ? Math.max(start, row.end) : start;
    return text ? [{ speaker, text, start, end }] : [];
  });
}

export function buildTranscriptText(segments: TranscriptSegment[], fallback = ""): string {
  if (segments.length === 0) return fallback.trim();
  return segments.map((segment) => `[${segment.speaker}] ${segment.text}`).join("\n");
}

export function extractVoiceSummary(text: string): VoiceSummary {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("Hermes JSON 결과를 읽지 못했습니다.");
  const parsed = JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
  return {
    title: trimmedString(parsed.title, 200) || "음성 기록",
    summary: trimmedString(parsed.summary, 20_000),
    key_points: stringList(parsed.key_points),
    action_items: stringList(parsed.action_items),
  };
}

export function defaultSpeakerName(speaker: string, orderedSpeakers: string[] = []): string {
  const numeric = /^speaker[_-]?(\d+)$/i.exec(speaker)?.[1];
  if (numeric !== undefined) return `화자 ${Number(numeric) + 1}`;
  const index = orderedSpeakers.indexOf(speaker);
  return `화자 ${index >= 0 ? index + 1 : 1}`;
}
