import type { FieldScene, SceneFile } from "./types";
import type { HybridSceneType, SceneBoundaryDecision } from "./hybrid-types";

const LABELS: Record<HybridSceneType, string> = {
  profile: "프로필", consultation: "상담", treatment: "시술",
  skin_care: "피부관리", interior: "인테리어", etc: "기타",
};

// 촬영 순서대로 번호를 매긴다 (카테고리별 고정번호가 아님) — 예: 01_상담, 02_시술, 03_프로필
export function simpleSceneFolderName(index: number, sceneType: HybridSceneType = "etc") {
  return `${String(index).padStart(2, "0")}_${LABELS[sceneType]}`;
}

export function buildFieldScenesFromBoundaries(
  files: SceneFile[],
  decisions: SceneBoundaryDecision[],
): FieldScene[] {
  const splitByIndex = new Map(decisions.filter((decision) => decision.decision !== "merge")
    .map((decision) => [decision.boundaryIndex, decision]));
  const starts = [0, ...Array.from(splitByIndex.keys()).sort((a, b) => a - b), files.length];
  const scenes: FieldScene[] = [];
  const firstAnalysis = decisions.find((decision) => decision.aiAnalysis)?.aiAnalysis;
  for (let part = 0; part < starts.length - 1; part++) {
    const sceneFiles = files.slice(starts[part], starts[part + 1]);
    if (sceneFiles.length === 0) continue;
    const index = scenes.length + 1;
    const boundaryBefore = splitByIndex.get(starts[part]);
    const sceneType = part === 0
      ? firstAnalysis?.beforeSceneType ?? "unknown"
      : boundaryBefore?.aiAnalysis?.afterSceneType ?? "unknown";
    const folderName = simpleSceneFolderName(index, sceneType);
    scenes.push({
      index,
      folderName,
      editedName: folderName,
      startTime: sceneFiles[0].mtime,
      endTime: sceneFiles[sceneFiles.length - 1].mtime,
      fileCount: sceneFiles.length,
      files: sceneFiles,
      sceneDir: null,
      sceneType: null,
      suggestedName: folderName,
      aiConfidence: (part === 0 ? firstAnalysis?.confidence : boundaryBefore?.aiAnalysis?.confidence) ?? null,
      aiReason: boundaryBefore?.reasons.join(" · ") ?? null,
      subScenes: [],
      profileCount: 0,
      qualityRejectCount: 0,
      nameLoading: false,
      boundaryBefore,
      approved: false,
    });
  }
  return scenes;
}
