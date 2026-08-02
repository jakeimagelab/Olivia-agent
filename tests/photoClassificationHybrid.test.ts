import { describe, expect, it } from "vitest";
import { DERMATOLOGY_PRECISE_SETTINGS } from "@/lib/photo-classifier/classification-settings";
import { buildCandidateSegments, buildVisualBoundaryCandidates, sortTimestampedFiles } from "@/lib/photo-classifier/candidate-builder";
import { BOUNDARY_WEIGHTS, decideBoundary } from "@/lib/photo-classifier/boundary-score";
import { stabilizeBoundaries } from "@/lib/photo-classifier/boundary-stabilizer";
import { evaluateSceneBoundaries } from "@/lib/photo-classifier/evaluation/metrics";
import { buildFieldScenesFromBoundaries, simpleSceneFolderName } from "@/lib/photo-classifier/scene-builder";
import { parseExifTimestamp } from "@/lib/photo-classifier/timestamp";
import { buildPurposeSampleIndices, findPurposeTransitions } from "@/lib/photo-classifier/purpose-scan";
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
  it("uses the approved boundary weights and dermatology defaults", () => {
    expect(Object.values(BOUNDARY_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(DERMATOLOGY_PRECISE_SETTINGS).toMatchObject({ hardGapMinutes: 3.5, softGapSeconds: 25, splitThreshold: 0.72, reviewThreshold: 0.55, minimumSceneImages: 2, scanWindowSize: 3 });
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

  it.each([
    ["5분 이내 환자 변경", analysis({ dominantPersonChanged: true, personChangeConfidence: 0.95 })],
    ["5분 이내 의료진 변경", analysis({ dominantPersonChanged: true, personChangeConfidence: 0.9, hasPatient: false, hasStaff: true })],
    ["5분 이내 장비 변경", analysis({ equipmentPresent: true, equipmentCategory: "laser_device", equipmentChanged: true, equipmentChangeConfidence: 0.95 })],
    ["5분 이내 장소 변경", analysis({ locationType: "laser_room", locationChanged: true, locationChangeConfidence: 0.95 })],
    ["상담에서 시술(레이저)", analysis({ equipmentPresent: true, beforeSceneType: "consultation", afterSceneType: "treatment", sceneType: "treatment", sceneTypeChanged: true })],
    ["상담에서 시술(주사)", analysis({ syringePresent: true, beforeSceneType: "consultation", afterSceneType: "treatment", sceneType: "treatment", sceneTypeChanged: true })],
    ["상담에서 프로필", analysis({ beforeSceneType: "consultation", afterSceneType: "profile", sceneType: "profile", sceneTypeChanged: true })],
    ["시술에서 프로필", analysis({ beforeSceneType: "treatment", afterSceneType: "profile", sceneType: "profile", sceneTypeChanged: true })],
    ["시술에서 인테리어", analysis({ beforeSceneType: "treatment", afterSceneType: "interior", sceneType: "interior", sceneTypeChanged: true })],
    ["인테리어에서 상담", analysis({ beforeSceneType: "interior", afterSceneType: "consultation", sceneType: "consultation", sceneTypeChanged: true })],
    ["인테리어에서 프로필", analysis({ beforeSceneType: "interior", afterSceneType: "profile", sceneType: "profile", sceneTypeChanged: true })],
    ["앉음에서 누움과 장비 등장", analysis({ equipmentPresent: true, beforePatientPose: "sitting", afterPatientPose: "lying", patientPose: "lying" })],
    ["다른 환자 같은 장소와 장비", analysis({ dominantPersonChanged: true, personChangeConfidence: 0.94 })],
    ["같은 환자 다른 장소", analysis({ locationChanged: true, locationChangeConfidence: 0.95, locationType: "laser_room" })],
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
});
