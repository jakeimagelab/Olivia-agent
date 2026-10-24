import { describe, expect, it } from "vitest";

import {
  buildFieldScenesFromBridgePlan,
  createBridgeClassificationPlan,
  validateBridgeClassificationPlan,
  type BridgeClassificationPlan,
} from "@/lib/photo-bridge/classificationPlan";
import type { BridgeSceneAnalysis } from "@/lib/photo-bridge/bridgeFiles";
import type { SceneBoundaryDecision } from "@/lib/photo-classifier/hybrid-types";

const features = {
  dHash: "0".repeat(64),
  colorHistogram: new Array(64).fill(0),
  backgroundGrid: new Array(24).fill(0),
  compositionGrid: new Array(16).fill(0),
  brightness: 0,
};

const split: SceneBoundaryDecision = {
  boundaryIndex: 2,
  beforeFileName: "B.JPG",
  afterFileName: "C.JPG",
  score: 0.82,
  decision: "split",
  forced: false,
  source: "local",
  reasons: ["장면 변화"],
  features: {
    timeGapScore: 0.2,
    personChangeScore: 0,
    locationChangeScore: 0,
    equipmentChangeScore: 0,
    poseChangeScore: 0,
    sceneTypeChangeScore: 0,
    visualChangeScore: 0.9,
    shotDistanceChangeScore: 0,
  },
  needsReview: true,
};

function file(name: string, index: number) {
  const value = { name, size: 100 + index, lastModified: 1_000 + index } as File;
  return {
    id: name,
    name,
    extension: "JPG",
    handle: { kind: "file", name, getFile: async () => value } as unknown as FileSystemFileHandle,
    file: value,
    size: value.size,
    lastModified: value.lastModified,
    mtime: 10_000 + index,
    timestampSource: "datetime_original" as const,
    visualFeatures: features,
  };
}

function analysis(): BridgeSceneAnalysis {
  const files = [file("A.JPG", 0), file("B.JPG", 1), file("C.JPG", 2)];
  return {
    files,
    boundaries: [split],
    scenes: [
      { id: "scene-1", label: "Scene 1", startIndex: 0, endIndex: 2, fileCount: 2, firstFileName: "A.JPG", lastFileName: "B.JPG", representativeFileName: "B.JPG", needsReview: false },
      { id: "scene-2", label: "Scene 2", startIndex: 2, endIndex: 3, fileCount: 1, firstFileName: "C.JPG", lastFileName: "C.JPG", representativeFileName: "C.JPG", needsReview: true },
    ],
  };
}

function plan() {
  return createBridgeClassificationPlan({
    folderKey: "촬영본",
    folderName: "촬영본",
    directory: { kind: "directory", name: "촬영본" } as FileSystemDirectoryHandle,
    analysis: analysis(),
    id: "plan-1",
    createdAt: "2026-10-25T00:00:00.000Z",
  });
}

describe("Bridge classification plan", () => {
  it("정렬 파일과 경계를 기존 사진 분류 Scene으로 변환한다", () => {
    const result = buildFieldScenesFromBridgePlan(plan());

    expect(result.map((scene) => scene.files.map((entry) => entry.name))).toEqual([
      ["A.JPG", "B.JPG"],
      ["C.JPG"],
    ]);
    expect(result[1].boundaryBefore).toEqual(split);
    expect(result.every((scene) => scene.sceneDir === null)).toBe(true);
  });

  it("현재 폴더의 파일 서명이 같으면 계획을 허용한다", () => {
    const current = analysis().files.map(({ name, size, lastModified }) => ({ name, size, lastModified }));
    expect(validateBridgeClassificationPlan(plan(), { sameFolder: true, folderName: "촬영본", jpgs: current })).toEqual({ ok: true });
  });

  it("JPG 추가·변경과 다른 폴더를 거부한다", () => {
    const current = analysis().files.map(({ name, size, lastModified }) => ({ name, size, lastModified }));
    expect(validateBridgeClassificationPlan(plan(), { sameFolder: false, folderName: "촬영본", jpgs: current })).toMatchObject({ ok: false });
    expect(validateBridgeClassificationPlan(plan(), { sameFolder: true, folderName: "촬영본", jpgs: [...current, { name: "D.JPG", size: 1, lastModified: 1 }] })).toMatchObject({ ok: false });
    expect(validateBridgeClassificationPlan(plan(), { sameFolder: true, folderName: "촬영본", jpgs: current.map((entry) => entry.name === "B.JPG" ? { ...entry, size: 999 } : entry) })).toMatchObject({ ok: false });
  });

  it("겹치거나 비어 있는 Scene 범위를 거부한다", () => {
    const invalid = plan() as BridgeClassificationPlan;
    invalid.scenes = invalid.scenes.map((scene, index) => index === 1 ? { ...scene, startIndex: 1, fileCount: 2 } : scene);

    expect(validateBridgeClassificationPlan(invalid, {
      sameFolder: true,
      folderName: "촬영본",
      jpgs: analysis().files,
    })).toMatchObject({ ok: false });
  });

  it("지원하지 않는 계획 버전을 거부한다", () => {
    const unsupported = { ...plan(), version: 2 } as unknown as BridgeClassificationPlan;

    expect(validateBridgeClassificationPlan(unsupported, {
      sameFolder: true,
      folderName: "촬영본",
      jpgs: analysis().files,
    })).toMatchObject({ ok: false });
  });
});
