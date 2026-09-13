import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeWaveformFrame, preferredMimeType } from "@/lib/voice/browserRecorder";
import { baseAudioMimeType, extensionFromMime, VOICE_TRANSCRIPTION_MAX_BYTES } from "@/lib/voice/config";
import { buildTranscriptText, defaultSpeakerName, extractVoiceSummary, normalizeTranscriptSegments } from "@/lib/voice/processing";
import { extractOpenAIResponseText, VOICE_SUMMARY_SCHEMA } from "@/lib/voice/summarizer";
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

  it("keeps silence calm while making quiet iPhone speech visibly responsive", () => {
    const silence = analyzeWaveformFrame(new Uint8Array(256).fill(128));
    expect(Math.max(...silence.values)).toBeCloseTo(0.05);

    const quietSpeech = Uint8Array.from({ length: 256 }, (_, index) => (
      Math.round(128 + Math.sin(index / 3) * (index % 19 < 8 ? 7 : 2))
    ));
    const active = analyzeWaveformFrame(quietSpeech, silence.values, silence.ceiling);
    expect(active.rms).toBeGreaterThan(0.012);
    expect(Math.max(...active.values)).toBeGreaterThan(0.12);
    expect(new Set(active.values.map((value) => value.toFixed(3))).size).toBeGreaterThan(3);
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

  it("reads a strict OpenAI Responses payload for the offline-Hermes fallback", () => {
    const json = '{"title":"미팅","summary":"정리","key_points":["핵심"],"action_items":[]}';
    expect(extractOpenAIResponseText({
      output: [{ content: [{ type: "output_text", text: json }] }],
    })).toBe(json);
    expect(VOICE_SUMMARY_SCHEMA.additionalProperties).toBe(false);
    expect(VOICE_SUMMARY_SCHEMA.required).toEqual(["title", "summary", "key_points", "action_items"]);
  });
});

describe("Olivia voice integration guardrails", () => {
  it("registers voice recording in Olivia navigation", () => {
    const result = resolveFeatureIntent("회의 녹음 열어줘");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.tool.href).toBe("/voice-recorder");

    const mobileHome = readFileSync("components/olivia-mobile/MobileHome.tsx", "utf8");
    const mobileShell = readFileSync("components/olivia-mobile/OliviaMobileShell.tsx", "utf8");
    const mobileVoice = readFileSync("components/olivia-mobile/MobileVoice.tsx", "utf8");
    expect(mobileHome).toContain('onNavigate("voice")');
    expect(mobileHome).toContain('aria-label="음성 기록 열기"');
    expect(mobileShell).toContain('<MobileVoice onBack=');
    expect(mobileVoice).toContain("<OliviaRecorder embedded mobileShell");
    expect(mobileVoice).toContain("<MobileHeader");

    const recorder = readFileSync("components/voice/OliviaRecorder.tsx", "utf8");
    expect(recorder).toContain("지금 대화를 기록해보세요");
    expect(recorder).toContain("mobileStartButton");
  });

  it("keeps Hermes read-only and preserves transcribed fallback", () => {
    const processRoute = readFileSync("app/api/voice/sessions/[id]/process/route.ts", "utf8");
    expect(processRoute).toContain('form.append("model", "gpt-4o-transcribe-diarize")');
    expect(processRoute).toContain('form.append("response_format", "diarized_json")');
    expect(processRoute).toContain('form.append("chunking_strategy", "auto")');
    const summarizer = readFileSync("lib/voice/summarizer.ts", "utf8");
    expect(summarizer).toContain("canEdit: false");
    expect(summarizer).toContain("canFinalize: false");
    expect(summarizer).toContain("hermes.toolCalls.length > 0");
    expect(summarizer).toContain('provider: "openai"');
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
