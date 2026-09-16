import { describe, expect, it } from "vitest";
import { DERMATOLOGY_PRECISE_SETTINGS } from "@/lib/photo-classifier/classification-settings";
import { buildCandidateSegments, buildVisualBoundaryCandidates, sortTimestampedFiles } from "@/lib/photo-classifier/candidate-builder";
import { BOUNDARY_WEIGHTS, decideBoundary } from "@/lib/photo-classifier/boundary-score";
import { stabilizeBoundaries } from "@/lib/photo-classifier/boundary-stabilizer";
import { evaluateSceneBoundaries } from "@/lib/photo-classifier/evaluation/metrics";
import { buildFieldScenesFromBoundaries, simpleSceneFolderName } from "@/lib/photo-classifier/scene-builder";
import { parseExifTimestamp } from "@/lib/photo-classifier/timestamp";
import { buildPurposeSampleIndices, findPurposeTransitions } from "@/lib/photo-classifier/purpose-scan";
import sceneV2GroundTruth from "./fixtures/dermatology-scene-v2-ground-truth.json";
import type {
  HybridSceneType, LocalVisualFeatures, SceneBoundaryDecision, SceneFrameAnalysis,
  TimestampedFile, VisualBoundaryCandidate,
} from "@/lib/photo-classifier/hybrid-types";
import type { SceneFile } from "@/lib/photo-classifier/types";

const fakeHandle = {} as FileSystemFileHandle;

function file(name: string, mtime: number): TimestampedFile {
  return { name, mtime, handle: fakeHandle, timestampSource: "mtime" };
}

function feature(seed: number): LocalVisualFeatures {
  return {
    dHash: (seed ? "1" : "0").repeat(64),
    colorHistogram: Array.from({ length: 64 }, (_, index) => index === seed ? 1 : 0),
    backgroundGrid: new Array(24).fill(seed),
    compositionGrid: new Array(16).fill(seed),
    brightness: seed,
  };
}

function analysis(overrides: Partial<SceneFrameAnalysis> = {}): SceneFrameAnalysis {
  return {
    peopleCount: 2,
    hasDoctor: true,
    hasPatient: true,
    hasStaff: false,
    dominantPersonChanged: false,
    personChangeConfidence: 0,
    locationType: "treatment_room",
    locationChanged: false,
    locationChangeConfidence: 0,
    equipmentPresent: false,
    equipmentCategory: "none",
    equipmentChanged: false,
    equipmentChangeConfidence: 0,
    handpiecePresent: false,
    syringePresent: false,
    treatmentBedPresent: false,
    consultationDeskPresent: true,
    patientPose: "sitting",
    beforePatientPose: "sitting",
    afterPatientPose: "sitting",
    shotDistance: "medium",
    beforeShotDistance: "medium",
    afterShotDistance: "medium",
    sceneType: "consultation",
    beforeSceneType: "consultation",
    afterSceneType: "consultation",
    sceneTypeChanged: false,
    confidence: 0.95,
    reasons: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<VisualBoundaryCandidate> = {}): VisualBoundaryCandidate {
  return { boundaryIndex: 10, timeGapMs: 10_000, visualChangeScore: 0.55, hardGap: false, requiresAi: true, ...overrides };
}

function decision(input: Partial<SceneBoundaryDecision> & Pick<SceneBoundaryDecision, "boundaryIndex" | "score" | "decision">): SceneBoundaryDecision {
  return {
    beforeFileName: `IMG_${input.boundaryIndex - 1}.jpg`, afterFileName: `IMG_${input.boundaryIndex}.jpg`,
    forced: false, source: "ai", reasons: [], needsReview: false,
    features: { timeGapScore: 0, personChangeScore: 0, locationChangeScore: 0, equipmentChangeScore: 0, poseChangeScore: 0, sceneTypeChangeScore: 0, visualChangeScore: 0, shotDistanceChangeScore: 0 },
    ...input,
  };
}

describe("hybrid photo classification", () => {
  it("matches the high-confidence boundaries extracted from the failure ZIP", () => {
    for (const example of sceneV2GroundTruth) {
      const candidateResult = buildVisualBoundaryCandidates(
        [file(example.beforeFile, 0), file(example.afterFile, example.timeGapSeconds * 1_000)],
        [feature(0), feature(0)],
        DERMATOLOGY_PRECISE_SETTINGS,
      )[0];
      const result = decideBoundary({
        candidate: candidateResult,
        analysis: example.expectedDecision === "merge" ? analysis({ confidence: 0.9 }) : null,
        settings: DERMATOLOGY_PRECISE_SETTINGS,
        beforeFileName: example.beforeFile,
        afterFileName: example.afterFile,
      });
      expect(result.decision, `${example.beforeFile} → ${example.afterFile}`).toBe(example.expectedDecision);
    }
  });

  it("uses the approved boundary weights and dermatology defaults", () => {
    expect(Object.values(BOUNDARY_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(DERMATOLOGY_PRECISE_SETTINGS).toMatchObject({ hardGapMinutes: 5, softGapSeconds: 10, sameSceneMaxSeconds: 10, aiBoundaryStartSeconds: 180, aiBoundaryEndSeconds: 300, splitThreshold: 0.72, reviewThreshold: 0.55, minimumSceneImages: 2, scanWindowSize: 3 });
    expect(DERMATOLOGY_PRECISE_SETTINGS).not.toHaveProperty("strongSplitStartSeconds");
  });

  it("sorts by capture time and uses names as a stable fallback", () => {
    const sorted = sortTimestampedFiles([file("IMG_10.jpg", 2), file("IMG_2.jpg", 2), file("IMG_1.jpg", 1)]);
    expect(sorted.map((item) => item.name)).toEqual(["IMG_1.jpg", "IMG_2.jpg", "IMG_10.jpg"]);
  });

  it("uses hard gaps to build candidate ranges instead of final folders", () => {
    const segments = buildCandidateSegments([file("1.jpg", 0), file("2.jpg", 60_000), file("3.jpg", 7 * 60_000)], 5);
    expect(segments).toEqual([{ startIndex: 0, endIndex: 1, hardBoundaryAfter: true }, { startIndex: 2, endIndex: 2, hardBoundaryAfter: false }]);
  });

  it("scans the middle of long candidates with sliding windows", () => {
    const files = Array.from({ length: 120 }, (_, index) => file(`${index}.jpg`, index * 1_000));
    const features = files.map((_, index) => feature(index < 60 ? 0 : 1));
    const candidates = buildVisualBoundaryCandidates(files, features, DERMATOLOGY_PRECISE_SETTINGS);
    expect(candidates.some((item) => item.boundaryIndex >= 58 && item.boundaryIndex <= 62)).toBe(true);
  });

  it("TEST 1 — under 180 seconds is not sent to AI just for the time gap (default SAME_SCENE bias band)", () => {
    const files = [file("a.jpg", 0), file("b.jpg", 90 * 1_000)];
    const candidates = buildVisualBoundaryCandidates(files, [feature(0), feature(0)], DERMATOLOGY_PRECISE_SETTINGS);
    expect(candidates).toEqual([]);
  });

  it.each([198, 272, 190, 208, 219])("TEST 2 — a %ss gap (180–300s band) requires AI review and is never an automatic split", (gapSeconds) => {
    const files = [file("before.jpg", 0), file("after.jpg", gapSeconds * 1_000)];
    const [candidateResult] = buildVisualBoundaryCandidates(files, [feature(0), feature(0)], DERMATOLOGY_PRECISE_SETTINGS);
    expect(candidateResult).toMatchObject({ hardGap: false, requiresAi: true });
    expect(candidateResult).not.toHaveProperty("strongGap");
    const withoutAi = decideBoundary({ candidate: candidateResult, analysis: null, settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "before.jpg", afterFileName: "after.jpg" });
    expect(withoutAi).toMatchObject({ decision: "review", forced: false });
    expect(withoutAi.source).not.toBe("strong_gap");
  });

  it("TEST 3 — a 180–300s gap merges only when AI confidence is high and confirms SAME_SCENE", () => {
    const [candidateResult] = buildVisualBoundaryCandidates(
      [file("before.jpg", 0), file("after.jpg", 220 * 1_000)],
      [feature(0), feature(0)],
      DERMATOLOGY_PRECISE_SETTINGS,
    );
    const merged = decideBoundary({ candidate: candidateResult, analysis: analysis({ confidence: 0.9 }), settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "before.jpg", afterFileName: "after.jpg" });
    expect(merged.decision).toBe("merge");
    const lowConfidence = decideBoundary({ candidate: candidateResult, analysis: analysis({ confidence: 0.6 }), settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "before.jpg", afterFileName: "after.jpg" });
    expect(lowConfidence).toMatchObject({ decision: "review", needsReview: true });
  });

  it("TEST 4 — hard-splits at five minutes regardless of AI, and never carries a strongGap field", () => {
    const files = [file("a.jpg", 0), file("b.jpg", 6 * 60_000)];
    const [candidateResult] = buildVisualBoundaryCandidates(files, [feature(0), feature(0)], DERMATOLOGY_PRECISE_SETTINGS);
    expect(candidateResult).not.toHaveProperty("strongGap");
    const result = decideBoundary({ candidate: candidateResult, analysis: null, settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "a.jpg", afterFileName: "b.jpg" });
    expect(result).toMatchObject({ decision: "split", forced: true, source: "hard_gap" });
  });

  it("TEST 5 — allows a high-confidence SAME decision for a staff-only change well past 60 seconds", () => {
    const result = decideBoundary({
      candidate: candidate({ timeGapMs: 150_000, visualChangeScore: 0.9 }),
      analysis: analysis({ hasStaff: true, peopleCount: 3, confidence: 0.9 }),
      settings: DERMATOLOGY_PRECISE_SETTINGS,
      beforeFileName: "R5K00213.JPG",
      afterFileName: "R5K00214.JPG",
    });
    expect(result.decision).toBe("merge");
  });

  it.each([
    ["primary clinician", analysis({ primaryClinicianChanged: true, primaryClinicianChangeConfidence: 0.9 })],
    ["primary device", analysis({ primaryMedicalDeviceChanged: true, primaryMedicalDeviceChangeConfidence: 0.9 })],
    ["primary handpiece", analysis({ primaryHandpieceChanged: true, primaryHandpieceChangeConfidence: 0.9 })],
  ])("splits a semantic change within 60 seconds: %s", (_, frameAnalysis) => {
    const result = decideBoundary({ candidate: candidate({ timeGapMs: 30_000 }), analysis: frameAnalysis, settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "a.jpg", afterFileName: "b.jpg" });
    expect(result).toMatchObject({ decision: "split", forced: true });
  });

  it("splits treatment to consultation as a meaningful purpose transition", () => {
    const result = decideBoundary({ candidate: candidate({ timeGapMs: 30_000 }), analysis: analysis({ beforeSceneType: "treatment", afterSceneType: "consultation", sceneType: "consultation", sceneTypeChanged: true }), settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "a.jpg", afterFileName: "b.jpg" });
    expect(result).toMatchObject({ decision: "split", forced: true });
  });

  it("does not let the minimum-scene stabilizer remove a forced hard-gap boundary", () => {
    const strong = decision({ boundaryIndex: 1, score: 0.1, decision: "split", forced: true, source: "hard_gap" });
    const stabilized = stabilizeBoundaries([strong], 5, 3);
    expect(stabilized[0]).toMatchObject({ decision: "split", forced: true, source: "hard_gap" });
  });

  it("hard-splits only after five minutes", () => {
    const candidates = buildVisualBoundaryCandidates(
      [file("a.jpg", 0), file("b.jpg", 5 * 60_000 + 1)],
      [feature(0), feature(0)],
      DERMATOLOGY_PRECISE_SETTINGS,
    );
    expect(candidates).toMatchObject([{ hardGap: true, requiresAi: false }]);
  });

  it("treats exactly five minutes as a hard gap", () => {
    const [candidateResult] = buildVisualBoundaryCandidates(
      [file("a.jpg", 0), file("b.jpg", 5 * 60_000)],
      [feature(0), feature(0)],
      DERMATOLOGY_PRECISE_SETTINGS,
    );
    expect(candidateResult).toMatchObject({ hardGap: true, strongGap: false, requiresAi: false });
  });

  it.each([
    ["주체 의료진 변경", analysis({ dominantPersonChanged: true, personChangeConfidence: 0.95, primaryClinicianChanged: true, primaryClinicianChangeConfidence: 0.95 })],
    ["주체 의료진 변경(환자 없음)", analysis({ dominantPersonChanged: true, personChangeConfidence: 0.9, primaryClinicianChanged: true, primaryClinicianChangeConfidence: 0.9, hasPatient: false, hasStaff: true })],
    ["주요 장비 ID 변경", analysis({ equipmentPresent: true, equipmentCategory: "laser_device", equipmentChanged: true, equipmentChangeConfidence: 0.95, primaryMedicalDeviceChanged: true, primaryMedicalDeviceChangeConfidence: 0.95, primaryMedicalDeviceIdBefore: "thermage_flx", primaryMedicalDeviceIdAfter: "soprano_titanium" })],
    ["5분 이내 장소 변경", analysis({ locationType: "laser_room", locationChanged: true, locationChangeConfidence: 0.95 })],
    ["상담에서 시술(레이저)", analysis({ equipmentPresent: true, beforeSceneType: "consultation", afterSceneType: "treatment", sceneType: "treatment", sceneTypeChanged: true })],
    ["상담에서 시술(주사)", analysis({ syringePresent: true, beforeSceneType: "consultation", afterSceneType: "treatment", sceneType: "treatment", sceneTypeChanged: true })],
    ["상담에서 프로필", analysis({ beforeSceneType: "consultation", afterSceneType: "profile", sceneType: "profile", sceneTypeChanged: true })],
    ["시술에서 프로필", analysis({ beforeSceneType: "treatment", afterSceneType: "profile", sceneType: "profile", sceneTypeChanged: true })],
    ["시술에서 인테리어", analysis({ beforeSceneType: "treatment", afterSceneType: "interior", sceneType: "interior", sceneTypeChanged: true })],
    ["인테리어에서 상담", analysis({ beforeSceneType: "interior", afterSceneType: "consultation", sceneType: "consultation", sceneTypeChanged: true })],
    ["인테리어에서 프로필", analysis({ beforeSceneType: "interior", afterSceneType: "profile", sceneType: "profile", sceneTypeChanged: true })],
    ["다른 방", analysis({ locationChanged: true, locationChangeConfidence: 0.95, roomChanged: true, roomChangeConfidence: 0.95 })],
  ])("forces a split for %s", (_, frameAnalysis) => {
    const result = decideBoundary({ candidate: candidate(), analysis: frameAnalysis, settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "a.jpg", afterFileName: "b.jpg" });
    expect(result.decision).toBe("split");
    expect(result.forced).toBe(true);
  });

  it.each([
    ["같은 장비 와이드에서 클로즈업", analysis({ beforeShotDistance: "wide", afterShotDistance: "closeup", shotDistance: "closeup" })],
    ["같은 장소에서 촬영 방향 변경", analysis({ beforeShotDistance: "wide", afterShotDistance: "full", shotDistance: "full" })],
    ["같은 환자의 다른 구도", analysis({ beforeShotDistance: "medium", afterShotDistance: "closeup", shotDistance: "closeup" })],
    ["장비 디테일 컷", analysis({ equipmentPresent: true, equipmentCategory: "laser_device", handpiecePresent: true, beforeShotDistance: "wide", afterShotDistance: "macro", shotDistance: "macro" })],
    ["보조 의료진 추가", analysis({ hasStaff: true, peopleCount: 3 })],
    ["일반 인물 그룹 변화(주체 의료진 동일)", analysis({ dominantPersonChanged: true, personChangeConfidence: 0.95, hasStaff: true })],
    ["자세·행동 변화", analysis({ beforePatientPose: "sitting", afterPatientPose: "lying", patientPose: "lying" })],
  ])("keeps one scene for %s", (_, frameAnalysis) => {
    const result = decideBoundary({ candidate: candidate({ visualChangeScore: 0.8 }), analysis: frameAnalysis, settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "a.jpg", afterFileName: "b.jpg" });
    expect(result.decision).toBe("merge");
  });

  it("forces a split at the hard time gap even when AI is unavailable", () => {
    const result = decideBoundary({ candidate: candidate({ hardGap: true, timeGapMs: 6 * 60_000 }), analysis: null, settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "a.jpg", afterFileName: "b.jpg" });
    expect(result).toMatchObject({ decision: "split", forced: true, source: "hard_gap" });
  });

  it("falls back to local visual evidence when the API fails", () => {
    const result = decideBoundary({ candidate: candidate({ visualChangeScore: 0.8 }), analysis: null, aiFailed: true, settings: DERMATOLOGY_PRECISE_SETTINGS, beforeFileName: "a.jpg", afterFileName: "b.jpg" });
    expect(result).toMatchObject({ decision: "split", source: "ai_fallback", needsReview: true });
  });

  it("protects a same-scene composition change under ten seconds", () => {
    const result = decideBoundary({
      candidate: candidate({ timeGapMs: 9_000, visualChangeScore: 0.95 }),
      analysis: analysis({ beforeShotDistance: "wide", afterShotDistance: "closeup", shotDistance: "closeup" }),
      settings: DERMATOLOGY_PRECISE_SETTINGS,
      beforeFileName: "a.jpg",
      afterFileName: "b.jpg",
    });
    expect(result.decision).toBe("merge");
  });

  it("merges an unstable two-photo scene unless its boundary is strong", () => {
    const stabilized = stabilizeBoundaries([decision({ boundaryIndex: 10, score: 0.75, decision: "split" }), decision({ boundaryIndex: 12, score: 0.74, decision: "split" })], 30, 3);
    expect(stabilized.filter((item) => item.decision === "split")).toHaveLength(1);
  });

  it("keeps a short but independently strong detail scene", () => {
    const stabilized = stabilizeBoundaries([decision({ boundaryIndex: 10, score: 0.9, decision: "split" }), decision({ boundaryIndex: 12, score: 0.88, decision: "split" })], 30, 3);
    expect(stabilized.filter((item) => item.decision === "split")).toHaveLength(2);
  });

  it("creates provisional scenes for review boundaries without moving files", () => {
    const files = Array.from({ length: 6 }, (_, index): SceneFile => ({ name: `${index}.jpg`, basename: `${index}`, handle: fakeHandle, mtime: index }));
    const scenes = buildFieldScenesFromBoundaries(files, [decision({ boundaryIndex: 3, score: 0.6, decision: "review", needsReview: true })]);
    expect(scenes.map((scene) => scene.fileCount)).toEqual([3, 3]);
    expect(scenes.every((scene) => scene.sceneDir === null)).toBe(true);
  });

  it("calculates objective accuracy metrics with one-photo tolerance", () => {
    const report = evaluateSceneBoundaries({ predictedBoundaries: [10, 21, 40], groundTruthBoundaries: [10, 20, 40], totalImages: 60, tolerance: 1 });
    expect(report).toMatchObject({ boundaryPrecision: 1, boundaryRecall: 1, boundaryF1: 1, overSegmentationRate: 0, underSegmentationRate: 0 });
    expect(report.scenePurity).toBeCloseTo(59 / 60);
  });

  it("reports over- and under-segmentation separately", () => {
    const over = evaluateSceneBoundaries({ predictedBoundaries: [10, 20], groundTruthBoundaries: [10], totalImages: 30 });
    const under = evaluateSceneBoundaries({ predictedBoundaries: [10], groundTruthBoundaries: [10, 20], totalImages: 30 });
    expect(over.overSegmentationRate).toBe(0.5);
    expect(under.underSegmentationRate).toBe(0.5);
  });

  it("returns null for damaged or unsupported EXIF data", () => {
    expect(parseExifTimestamp(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
  });

  it("names scenes in occurrence order, not by fixed category number", () => {
    expect(simpleSceneFolderName(1, "consultation")).toBe("01_상담");
    expect(simpleSceneFolderName(2, "treatment")).toBe("02_시술");
    expect(simpleSceneFolderName(3, "profile")).toBe("03_프로필");
  });
});

describe("purpose scan (2차 Scene 분석)", () => {
  it("samples every photo when interval is 1 for small segments", () => {
    expect(buildPurposeSampleIndices(5, { interval: 1 })).toEqual([0, 1, 2, 3, 4]);
  });

  it("uses the default interval sparsely for a small segment but always includes the last photo", () => {
    expect(buildPurposeSampleIndices(5)).toEqual([0, 4]);
  });

  it("samples by interval and always includes the last photo for mid-size segments", () => {
    const indices = buildPurposeSampleIndices(23, { interval: 5, maxSamples: 24 });
    expect(indices).toEqual([0, 5, 10, 15, 20, 22]);
  });

  it("caps sample count for very large segments instead of scanning every photo", () => {
    const indices = buildPurposeSampleIndices(500, { interval: 5, maxSamples: 24 });
    expect(indices.length).toBeLessThanOrEqual(24);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(499);
  });

  it("finds the transition point between consultation and treatment blocks", () => {
    const samples = [
      { index: 0, purpose: "consultation" as HybridSceneType },
      { index: 5, purpose: "consultation" as HybridSceneType },
      { index: 10, purpose: "consultation" as HybridSceneType },
      { index: 15, purpose: "treatment" as HybridSceneType },
      { index: 20, purpose: "treatment" as HybridSceneType },
      { index: 25, purpose: "treatment" as HybridSceneType },
      { index: 30, purpose: "profile" as HybridSceneType },
      { index: 34, purpose: "profile" as HybridSceneType },
    ];
    const transitions = findPurposeTransitions(samples);
    expect(transitions).toEqual([13, 28]);
  });

  it("finds no transitions when the whole segment is one purpose", () => {
    const samples = [
      { index: 0, purpose: "treatment" as HybridSceneType },
      { index: 10, purpose: "treatment" as HybridSceneType },
      { index: 20, purpose: "treatment" as HybridSceneType },
    ];
    expect(findPurposeTransitions(samples)).toEqual([]);
  });
});
