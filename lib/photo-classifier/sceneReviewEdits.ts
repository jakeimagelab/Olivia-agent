import { simpleSceneFolderName } from "./scene-builder";
import type { SceneBoundaryDecision, SceneCorrection } from "./hybrid-types";
import type { FieldScene } from "./types";

export const EMPTY_SCENE_BOUNDARY_FEATURES = {
  timeGapScore: 0,
  personChangeScore: 0,
  locationChangeScore: 0,
  equipmentChangeScore: 0,
  poseChangeScore: 0,
  sceneTypeChangeScore: 0,
  visualChangeScore: 0,
  shotDistanceChangeScore: 0,
};

export function mergePlannedFieldScenes(
  scenes: FieldScene[],
  firstIndex: number,
  secondIndex: number,
) {
  const first = scenes[firstIndex];
  const second = scenes[secondIndex];
  if (!first || !second || firstIndex === secondIndex) return scenes;

  const merged: FieldScene = {
    ...first,
    files: [...first.files, ...second.files],
    fileCount: first.fileCount + second.fileCount,
    endTime: second.endTime,
    approved: false,
  };

  return scenes
    .map((scene, index) => index === firstIndex ? merged : scene)
    .filter((_, index) => index !== secondIndex)
    .map((scene, index) => ({ ...scene, index: index + 1 }));
}

export function markBoundaryAsManuallyMerged(
  decisions: SceneBoundaryDecision[],
  boundaryIndex: number,
) {
  return decisions.map((decision) => decision.boundaryIndex === boundaryIndex
    ? {
        ...decision,
        decision: "merge" as const,
        source: "user" as const,
        needsReview: false,
        reasons: [...decision.reasons, "사용자가 병합함"],
      }
    : decision);
}

export function createMergeSceneCorrection(
  scene: FieldScene,
  projectId: string,
  createdAt = new Date().toISOString(),
): SceneCorrection | null {
  const boundary = scene.boundaryBefore;
  if (!boundary) return null;
  return {
    projectId,
    boundaryIndex: boundary.boundaryIndex,
    boundaryFileName: boundary.afterFileName,
    previousDecision: "split",
    correctedDecision: "merge",
    action: "merge",
    features: boundary.features,
    createdAt,
  };
}

export function splitPlannedFieldScene(
  scenes: FieldScene[],
  sceneIndex: number,
  offset: number,
  projectId: string,
  createdAt = new Date().toISOString(),
) {
  const scene = scenes[sceneIndex];
  if (!scene || scene.sceneDir || offset <= 0 || offset >= scene.files.length) return null;

  const beforeFile = scene.files[offset - 1];
  const afterFile = scene.files[offset];
  const boundaryIndex = scenes
    .slice(0, sceneIndex)
    .reduce((sum, item) => sum + item.files.length, 0) + offset;
  const boundaryDecision: SceneBoundaryDecision = {
    boundaryIndex,
    beforeFileName: beforeFile.name,
    afterFileName: afterFile.name,
    score: 1,
    decision: "split",
    forced: false,
    source: "user",
    reasons: ["사용자가 직접 경계를 추가함"],
    features: EMPTY_SCENE_BOUNDARY_FEATURES,
    needsReview: false,
  };
  const correction: SceneCorrection = {
    projectId,
    boundaryIndex,
    boundaryFileName: afterFile.name,
    previousDecision: "merge",
    correctedDecision: "split",
    action: "split",
    features: EMPTY_SCENE_BOUNDARY_FEATURES,
    createdAt,
  };
  const left: FieldScene = {
    ...scene,
    files: scene.files.slice(0, offset),
    fileCount: offset,
    endTime: beforeFile.mtime,
    approved: false,
  };
  const rightIndex = sceneIndex + 2;
  const rightName = simpleSceneFolderName(rightIndex);
  const right: FieldScene = {
    ...scene,
    index: rightIndex,
    folderName: rightName,
    editedName: rightName,
    suggestedName: rightName,
    files: scene.files.slice(offset),
    fileCount: scene.files.length - offset,
    startTime: afterFile.mtime,
    boundaryBefore: boundaryDecision,
    approved: false,
  };
  const nextScenes = [...scenes.slice(0, sceneIndex), left, right, ...scenes.slice(sceneIndex + 1)]
    .map((item, index) => ({ ...item, index: index + 1 }));

  return { scenes: nextScenes, boundaryDecision, correction };
}

export function createRenameSceneCorrection(
  scene: FieldScene,
  newName: string,
  projectId: string,
  createdAt = new Date().toISOString(),
): SceneCorrection {
  return {
    projectId,
    boundaryIndex: scene.boundaryBefore?.boundaryIndex ?? 0,
    boundaryFileName: scene.files[0]?.name ?? "",
    previousDecision: "split",
    correctedDecision: "split",
    action: "rename",
    features: scene.boundaryBefore?.features ?? EMPTY_SCENE_BOUNDARY_FEATURES,
    reason: `${scene.folderName} → ${newName}`,
    createdAt,
  };
}

export function createApproveSceneCorrection(
  scene: FieldScene,
  projectId: string,
  createdAt = new Date().toISOString(),
): SceneCorrection {
  const decision = scene.boundaryBefore?.decision === "merge" ? "merge" : "split";
  return {
    projectId,
    boundaryIndex: scene.boundaryBefore?.boundaryIndex ?? 0,
    boundaryFileName: scene.files[0]?.name ?? "",
    previousDecision: decision,
    correctedDecision: decision,
    action: "approve",
    features: scene.boundaryBefore?.features ?? EMPTY_SCENE_BOUNDARY_FEATURES,
    createdAt,
  };
}
