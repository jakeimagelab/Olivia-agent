import { describe, expect, it } from "vitest";
import {
  createApproveSceneCorrection,
  createMergeSceneCorrection,
  createRenameSceneCorrection,
  markBoundaryAsManuallyMerged,
  mergePlannedFieldScenes,
  splitPlannedFieldScene,
} from "@/lib/photo-classifier/sceneReviewEdits";
import type { SceneBoundaryDecision } from "@/lib/photo-classifier/hybrid-types";
import type { FieldScene, SceneFile } from "@/lib/photo-classifier/types";

function makeFile(name: string, mtime: number): SceneFile {
  return {
    name,
    basename: name.replace(/\.[^.]+$/u, ""),
    handle: {} as FileSystemFileHandle,
    mtime,
  };
}

function makeBoundary(boundaryIndex: number): SceneBoundaryDecision {
  return {
    boundaryIndex,
    beforeFileName: "A.JPG",
    afterFileName: "B.JPG",
    score: 0.8,
    decision: "split",
    forced: false,
    source: "ai",
    reasons: ["장면 변화"],
    features: {
      timeGapScore: 1,
      personChangeScore: 0,
      locationChangeScore: 0,
      equipmentChangeScore: 0,
      poseChangeScore: 0,
      sceneTypeChangeScore: 0,
      visualChangeScore: 0,
      shotDistanceChangeScore: 0,
    },
    needsReview: true,
  };
}

function makeScene(index: number, files: SceneFile[], boundaryBefore?: SceneBoundaryDecision): FieldScene {
  return {
    index,
    folderName: `Scene0${index}`,
    editedName: `Scene0${index}`,
    startTime: files[0]?.mtime ?? 0,
    endTime: files.at(-1)?.mtime ?? 0,
    fileCount: files.length,
    files,
    sceneDir: null,
    sceneType: null,
    suggestedName: null,
    aiConfidence: null,
    aiReason: null,
    subScenes: [],
    profileCount: 0,
    qualityRejectCount: 0,
    nameLoading: false,
    boundaryBefore,
    approved: true,
  };
}

describe("photo scene review edits", () => {
  it("merges planned scenes and renumbers the remaining plan", () => {
    const first = makeScene(1, [makeFile("A.JPG", 1)]);
    const second = makeScene(2, [makeFile("B.JPG", 2)], makeBoundary(1));
    const result = mergePlannedFieldScenes([first, second], 0, 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ index: 1, fileCount: 2, endTime: 2, approved: false });
    expect(result[0]?.files.map((file) => file.name)).toEqual(["A.JPG", "B.JPG"]);
  });

  it("splits a planned scene with one boundary decision and correction", () => {
    const scene = makeScene(1, [makeFile("A.JPG", 1), makeFile("B.JPG", 2), makeFile("C.JPG", 3)]);
    const result = splitPlannedFieldScene([scene], 0, 1, "project", "2026-11-13T00:00:00.000Z");

    expect(result?.scenes.map((item) => item.fileCount)).toEqual([1, 2]);
    expect(result?.scenes[1]).toMatchObject({ folderName: "02_미분류", startTime: 2, approved: false });
    expect(result?.boundaryDecision).toMatchObject({ boundaryIndex: 1, source: "user", decision: "split" });
    expect(result?.correction).toMatchObject({ projectId: "project", action: "split", boundaryFileName: "B.JPG" });
    expect(splitPlannedFieldScene([scene], 0, 0, "project")).toBeNull();
  });

  it("builds consistent merge, rename, approve, and boundary updates", () => {
    const boundary = makeBoundary(1);
    const scene = makeScene(2, [makeFile("B.JPG", 2)], boundary);

    expect(createMergeSceneCorrection(scene, "project", "now")).toMatchObject({ action: "merge", correctedDecision: "merge" });
    expect(createRenameSceneCorrection(scene, "02_상담", "project", "now")).toMatchObject({ action: "rename", reason: "Scene02 → 02_상담" });
    expect(createApproveSceneCorrection(scene, "project", "now")).toMatchObject({ action: "approve", previousDecision: "split" });
    expect(markBoundaryAsManuallyMerged([boundary], 1)[0]).toMatchObject({ decision: "merge", source: "user", needsReview: false });
  });
});
