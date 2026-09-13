import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { preferredMimeType } from "@/lib/voice/browserRecorder";
import { baseAudioMimeType, extensionFromMime, VOICE_TRANSCRIPTION_MAX_BYTES } from "@/lib/voice/config";
import { buildTranscriptText, defaultSpeakerName, extractVoiceSummary, normalizeTranscriptSegments } from "@/lib/voice/processing";
import { resolveFeatureIntent } from "@/lib/olivia/features/resolver";

describe("Olivia voice recorder format selection", () => {
  it("prefers iPhone-compatible MP4 before WebM", () => {
    const recorder = {
      isTypeSupported: (type: string) => type === "audio/mp4" || type === "audio/webm;codecs=opus",
    } as unknown as typeof MediaRecorder;
    expect(preferredMimeType(recorder)).toBe("audio/mp4");
  });

  it("falls back safely when MediaRecorder or a preferred codec is unavailable", () => {
    expect(preferredMimeType(undefined)).toBe("");
    const recorder = { isTypeSupported: () => false } as unknown as typeof MediaRecorder;
    expect(preferredMimeType(recorder)).toBe("");
  });

  it("normalizes codec parameters for Storage and preserves file extensions", () => {
    expect(baseAudioMimeType("audio/mp4;codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(baseAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(extensionFromMime("audio/mpeg")).toBe("mp3");
    expect(VOICE_TRANSCRIPTION_MAX_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("Olivia voice transcript preservation", () => {
  it("keeps speaker timestamps while rejecting malformed segments", () => {
    const segments = normalizeTranscriptSegments([
      { speaker: "speaker_0", text: " 첫 문장 ", start: 0.2, end: 4.4 },
      { speaker: "speaker_1", text: "두 번째 문장", start: 4.5, end: 8 },
      { speaker: "speaker_2", text: "" },
      null,
    ]);
    expect(segments).toEqual([
      { speaker: "speaker_0", text: "첫 문장", start: 0.2, end: 4.4 },
      { speaker: "speaker_1", text: "두 번째 문장", start: 4.5, end: 8 },
    ]);
    expect(buildTranscriptText(segments)).toBe("[speaker_0] 첫 문장\n[speaker_1] 두 번째 문장");
  });

  it("shows neutral Korean speaker names and parses fenced Hermes JSON", () => {
    expect(defaultSpeakerName("speaker_0")).toBe("화자 1");
    expect(defaultSpeakerName("speaker_3")).toBe("화자 4");
    expect(extractVoiceSummary('```json\n{"title":"미팅","summary":"요약","key_points":["A"],"action_items":[]}\n```'))
      .toEqual({ title: "미팅", summary: "요약", key_points: ["A"], action_items: [] });
  });
});

describe("Olivia voice integration guardrails", () => {
  it("registers voice recording in Olivia navigation", () => {
    const result = resolveFeatureIntent("회의 녹음 열어줘");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.tool.href).toBe("/voice-recorder");
  });

  it("keeps Hermes read-only and preserves transcribed fallback", () => {
    const processRoute = readFileSync("app/api/voice/sessions/[id]/process/route.ts", "utf8");
    expect(processRoute).toContain('form.append("model", "gpt-4o-transcribe-diarize")');
    expect(processRoute).toContain('form.append("response_format", "diarized_json")');
    expect(processRoute).toContain('form.append("chunking_strategy", "auto")');
    expect(processRoute).toContain("canEdit: false");
    expect(processRoute).toContain("canFinalize: false");
    expect(processRoute).toContain("hermes.toolCalls.length > 0");
    expect(processRoute).toContain('status: "transcribed"');
  });

  it("keeps the bucket private and protects the API through existing middleware", () => {
    const migration = readFileSync("supabase/migrations/20260913_voice_recordings.sql", "utf8");
    const middleware = readFileSync("middleware.ts", "utf8");
    const tabletApps = readFileSync("components/olivia-tablet/tabletApps.ts", "utf8");
    expect(migration).toContain("alter table public.voice_recordings enable row level security");
    expect(migration).toMatch(/'voice-recordings',[\s\S]*false,/);
    expect(middleware).toContain('"/api/voice"');
    expect(middleware).toContain('"/voice-recorder", "/voice-recorder/:path*"');
    expect(tabletApps).toContain('{ id: "voice", title: "음성 기록", fallbackIcon: "prompter" }');
    expect(tabletApps).not.toContain('id: "voice", title: "AI 음성"');
  });
});
