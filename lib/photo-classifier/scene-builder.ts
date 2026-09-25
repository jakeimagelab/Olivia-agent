import type { FieldScene, SceneFile } from "./types";
import type { HybridSceneType, SceneBoundaryDecision } from "./hybrid-types";

const LABELS: Record<HybridSceneType, string> = {
  profile: "프로필", consultation: "상담", treatment: "시술",
  skin_care: "피부관리", interior: "인테리어", etc: "기타",
};

export type SceneClassificationOrigin =
  | "ai"
  | "ai_unresolved"
  | "department_estimate"
  | "unclassified";

// 촬영 순서대로 번호를 매긴다 (카테고리별 고정번호가 아님) — 예: 01_상담, 02_시술, 03_프로필
export function simpleSceneFolderName(
  index: number,
  sceneType: HybridSceneType | null = null,
  options: { estimated?: boolean } = {},
) {
  const label = sceneType == null
    ? "미분류"
    : options.estimated
      ? `미분류(추정_${LABELS[sceneType]})`
      : LABELS[sceneType];
  return `${String(index).padStart(2, "0")}_${label}`;
}

export type SceneRange = {
  index: number;
  startIndex: number;
  endIndex: number;
  sceneType: HybridSceneType | null;
  classificationOrigin: SceneClassificationOrigin;
  folderName: string;
  aiConfidence: number | null;
  boundaryBefore?: SceneBoundaryDecision;
};

/**
 * File-handle-independent Scene plan shared by browser and Node runners.
 * `endIndex` is exclusive, matching Array#slice.
 */
export function buildSceneRangesFromBoundaries(
  totalImages: number,
  decisions: SceneBoundaryDecision[],
  options: { fallbackSceneType?: HybridSceneType } = {},
): SceneRange[] {
  const splitByIndex = new Map(decisions.filter((decision) => decision.decision !== "merge")
    .map((decision) => [decision.boundaryIndex, decision]));
  const starts = [0, ...Array.from(splitByIndex.keys()).sort((a, b) => a - b), totalImages];
  const firstAnalysis = decisions.find((decision) => decision.aiAnalysis)?.aiAnalysis;
  const ranges: SceneRange[] = [];

  for (let part = 0; part < starts.length - 1; part++) {
    if (starts[part] >= starts[part + 1]) continue;
    const index = ranges.length + 1;
    const boundaryBefore = splitByIndex.get(starts[part]);
    const analysis = part === 0 ? firstAnalysis : boundaryBefore?.aiAnalysis;
    const analyzedSceneType = part === 0 ? analysis?.beforeSceneType : analysis?.afterSceneType;
    const sceneType = analyzedSceneType ?? options.fallbackSceneType ?? null;
    const classificationOrigin: SceneClassificationOrigin = analyzedSceneType
      ? analyzedSceneType === "etc" ? "ai_unresolved" : "ai"
      : options.fallbackSceneType ? "department_estimate" : "unclassified";
    ranges.push({
      index,
      startIndex: starts[part],
      endIndex: starts[part + 1],
      sceneType,
      classificationOrigin,
      folderName: simpleSceneFolderName(index, sceneType, {
        estimated: classificationOrigin === "department_estimate",
      }),
      aiConfidence: analysis?.confidence ?? null,
      boundaryBefore,
    });
  }

  return ranges;
}

export function buildFieldScenesFromBoundaries(
  files: SceneFile[],
  decisions: SceneBoundaryDecision[],
): FieldScene[] {
  const scenes: FieldScene[] = [];
  for (const range of buildSceneRangesFromBoundaries(files.length, decisions)) {
    const sceneFiles = files.slice(range.startIndex, range.endIndex);
    if (sceneFiles.length === 0) continue;
    scenes.push({
      index: range.index,
      folderName: range.folderName,
      editedName: range.folderName,
      startTime: sceneFiles[0].mtime,
      endTime: sceneFiles[sceneFiles.length - 1].mtime,
      fileCount: sceneFiles.length,
      files: sceneFiles,
      sceneDir: null,
      sceneType: null,
      suggestedName: range.folderName,
      aiConfidence: range.aiConfidence,
      aiReason: range.boundaryBefore?.reasons.join(" · ") ?? null,
      subScenes: [],
      profileCount: 0,
      qualityRejectCount: 0,
      nameLoading: false,
      boundaryBefore: range.boundaryBefore,
      approved: false,
    });
  }
  return scenes;
}
