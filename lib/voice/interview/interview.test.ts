import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupTranscriptByQuestion } from "@/lib/voice/interview/groupTranscript";
import { buildInterviewQuestionSnapshot, nextInterviewVersionNumber, validateInterviewPreparation } from "@/lib/voice/interview/preparation";
import { nextMissingChunkSequence, normalizeInterviewRecoveryState } from "@/lib/voice/interview/recovery";
import {
  DOCTOR_BRAND_INTERVIEW_QUESTIONS,
  DOCTOR_BRAND_INTERVIEW_TEMPLATE_KEY,
  DOCTOR_BRAND_INTERVIEW_TEMPLATE_VERSION,
} from "@/lib/voice/interview/templates";

describe("doctor brand interview template", () => {
  it("contains exactly 30 brand and five feedback questions with unique numbers", () => {
    expect(DOCTOR_BRAND_INTERVIEW_QUESTIONS).toHaveLength(35);
    expect(DOCTOR_BRAND_INTERVIEW_QUESTIONS.filter((question) => question.type === "brand")).toHaveLength(30);
    expect(DOCTOR_BRAND_INTERVIEW_QUESTIONS.filter((question) => question.type === "feedback")).toHaveLength(5);
    expect(new Set(DOCTOR_BRAND_INTERVIEW_QUESTIONS.map((question) => question.id)).size).toBe(35);
    expect(new Set(DOCTOR_BRAND_INTERVIEW_QUESTIONS.map((question) => question.number)).size).toBe(35);
  });

  it("makes immutable snapshots in the selected user order", () => {
    const snapshot = buildInterviewQuestionSnapshot(["q31", "q01", "q13"]);
    expect(snapshot.map((question) => [question.id, question.order, question.type])).toEqual([
      ["q31", 0, "feedback"],
      ["q01", 1, "brand"],
      ["q13", 2, "brand"],
    ]);
    expect(snapshot[0].text).toBe(DOCTOR_BRAND_INTERVIEW_QUESTIONS[30].text);
  });

  it("requires explicit hospital, interviewee, and at least one known question before ready", () => {
    expect(() => validateInterviewPreparation({ hospitalName: "", intervieweeName: "김지훈", selectedQuestions: ["q01"] })).toThrow("병원명");
    expect(() => validateInterviewPreparation({ hospitalName: "여의도기통찬의원", intervieweeName: "", selectedQuestions: ["q01"] })).toThrow("인터뷰 대상");
    expect(() => validateInterviewPreparation({ hospitalName: "여의도기통찬의원", intervieweeName: "김지훈", selectedQuestions: [] })).toThrow("질문");
    expect(validateInterviewPreparation({
      hospitalName: " 여의도기통찬의원 ",
      intervieweeName: " 김지훈 원장 ",
      selectedQuestions: ["q01"],
      templateKey: DOCTOR_BRAND_INTERVIEW_TEMPLATE_KEY,
      templateVersion: DOCTOR_BRAND_INTERVIEW_TEMPLATE_VERSION,
    })).toMatchObject({ hospitalName: "여의도기통찬의원", intervieweeName: "김지훈 원장" });
  });

  it("increments versions without mutating past version records", () => {
    expect(nextInterviewVersionNumber([])).toBe(1);
    expect(nextInterviewVersionNumber([{ version_no: 1 }, { version_no: 3 }])).toBe(4);
  });
});

describe("interview marker grouping", () => {
  it("uses marker intervals as ground truth instead of guessing from AI", () => {
    const selectedQuestions = buildInterviewQuestionSnapshot(["q01", "q06", "q13"]);
    const groups = groupTranscriptByQuestion({
      selectedQuestions,
      markers: [
        { eventId: "e1", questionId: "q01", atSeconds: 10 },
        { eventId: "e2", questionId: "q06", atSeconds: 120 },
        { eventId: "e3", questionId: "q13", atSeconds: 280 },
      ],
      transcriptSegments: [
        { speaker: "speaker_0", text: "첫 답", start: 15, end: 30 },
        { speaker: "speaker_1", text: "둘 답", start: 150, end: 160 },
        { speaker: "speaker_0", text: "셋 답", start: 300, end: 320 },
      ],
      durationSeconds: 400,
    });
    expect(groups.map((group) => [group.startSeconds, group.endSeconds, group.transcript])).toEqual([
      [10, 120, "첫 답"],
      [120, 280, "둘 답"],
      [280, 400, "셋 답"],
    ]);
  });

  it("keeps a later answer to the same question as its own timeline segment", () => {
    const selectedQuestions = buildInterviewQuestionSnapshot(["q01", "q06", "q13"]);
    const groups = groupTranscriptByQuestion({
      selectedQuestions,
      markers: [
        { eventId: "e1", questionId: "q01", atSeconds: 0, clientSequence: 1 },
        { eventId: "e2", questionId: "q06", atSeconds: 90, clientSequence: 2 },
        { eventId: "e3", questionId: "q01", atSeconds: 150, clientSequence: 3 },
        { eventId: "e4", questionId: "q13", atSeconds: 210, clientSequence: 4 },
      ],
      transcriptSegments: [
        { speaker: "speaker_0", text: "첫 번째 답", start: 5, end: 40 },
        { speaker: "speaker_1", text: "두 번째 답", start: 100, end: 120 },
        { speaker: "speaker_0", text: "추가 답", start: 160, end: 180 },
        { speaker: "speaker_1", text: "세 번째 답", start: 220, end: 230 },
      ],
      durationSeconds: 270,
    });
    expect(groups.map((group) => [group.question.id, group.startSeconds, group.endSeconds, group.transcript])).toEqual([
      ["q01", 0, 90, "첫 번째 답"],
      ["q06", 90, 150, "두 번째 답"],
      ["q01", 150, 210, "추가 답"],
      ["q13", 210, 270, "세 번째 답"],
    ]);
  });
});

describe("interview recovery", () => {
  it("preserves confirmed sequences and starts from the next missing chunk", () => {
    const recovery = normalizeInterviewRecoveryState({
      preparationId: "prep", versionId: "version", recordingId: "recording", mode: "interview",
      currentChunk: 3, uploadedSequences: [0, 1, 2, 2], selectedQuestions: [], questionMarkers: [], highlightMarkers: [], fieldNotes: [], followUps: [],
    });
    expect(recovery?.uploadedSequences).toEqual([0, 1, 2]);
    expect(nextMissingChunkSequence(recovery?.uploadedSequences ?? [])).toBe(3);
    expect(nextMissingChunkSequence([0, 2], 0)).toBe(1);
  });
});

describe("interview persistence guardrails", () => {
  it("keeps preparation separate from recordings and only completes ready after PDF upload", () => {
    const migration = readFileSync("supabase/migrations/20260930_voice_interview_system.sql", "utf8");
    const ready = readFileSync("app/api/voice/interviews/preparations/[id]/ready/route.ts", "utf8");
    expect(migration).toContain("voice_interview_preparations");
    expect(migration).toContain("voice_interview_preparation_versions");
    expect(migration).toContain("voice_recording_chunks");
    expect(migration).toContain("voice_recording_events");
    expect(migration).toContain("voice-interview-documents");
    expect(ready).toContain("renderInterviewQuestionPdf");
    expect(ready).toContain("pdf_storage_path");
    expect(ready).toContain('status: "ready"');
    expect(ready).toContain('status: "draft"');
  });

  it("uses only a ready immutable version for recording and validates every stored segment", () => {
    const sessions = readFileSync("app/api/voice/sessions/route.ts", "utf8");
    const chunks = readFileSync("app/api/voice/sessions/[id]/chunks/route.ts", "utf8");
    const finalize = readFileSync("app/api/voice/sessions/[id]/finalize/route.ts", "utf8");
    expect(sessions).toContain('body.mode === "interview"');
    expect(sessions).toContain("current_version_id !== versionId");
    expect(chunks).toContain("createSignedUploadUrl");
    expect(chunks).toContain('status: "uploaded"');
    expect(finalize).toContain("validateContinuousSequences");
    expect(finalize).toContain("질문 시작 표시");
  });

  it("does not turn a failed interview analysis into failed original audio", () => {
    const processRoute = readFileSync("app/api/voice/sessions/[id]/process/route.ts", "utf8");
    const segmented = readFileSync("lib/voice/segmentedBrowserRecorder.ts", "utf8");
    expect(processRoute).toContain("markInterviewAnalysisError");
    expect(processRoute).toContain('analysis_status: "failed"');
    expect(processRoute).toContain('audio_status !== "stored"');
    expect(segmented).toContain("rotate(): Promise<Segment | null>");
    expect(segmented).not.toContain("html2canvas");
  });
});
