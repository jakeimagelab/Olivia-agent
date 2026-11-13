import { runFieldSecondaryAnalysis } from "./fieldSecondaryAnalysisRunner";
import { executePlannedFieldOutput, renameConfirmedFieldScenes } from "./fieldOutput";
import type { AccuracyReport, SceneBoundaryDecision, SceneCorrection } from "./hybrid-types";
import type { MergeDecision, SceneMergeCandidate } from "./scene-merge-types";
import type { FieldScene, FieldStats, MedicalDepartment } from "./types";
import type { SplitRawFile } from "./browserFileOps";

type RunnerDependencies = {
  executePlannedOutput: typeof executePlannedFieldOutput;
  renameScenes: typeof renameConfirmedFieldScenes;
  runSecondaryAnalysis: typeof runFieldSecondaryAnalysis;
};

const DEFAULT_DEPENDENCIES: RunnerDependencies = {
  executePlannedOutput: executePlannedFieldOutput,
  renameScenes: renameConfirmedFieldScenes,
  runSecondaryAnalysis: runFieldSecondaryAnalysis,
};

export async function runBrowserFieldReviewConfirmation({
  rootDirectory,
  scenes,
  jpgBaseDirectory,
  rawFiles,
  rawCount,
  fastAnalyzeMode,
  qualityAnalysisEnabled,
  profileClassificationEnabled,
  boundaryDecisions,
  sceneCorrections,
  accuracyReport,
  mergeCandidates,
  mergeDecisions,
  department,
  departmentDisplayName,
  gapMinutes,
  departmentLogicEnabled,
  aiNamingEnabled,
  rawSelectMode,
  isCancelled,
  onOutputProgress,
  onSecondaryProgress,
  onScenesUpdated,
  dependencies,
}: {
  rootDirectory: FileSystemDirectoryHandle;
  scenes: FieldScene[];
  jpgBaseDirectory: FileSystemDirectoryHandle | null;
  rawFiles: SplitRawFile[];
  rawCount: number;
  fastAnalyzeMode: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  boundaryDecisions: SceneBoundaryDecision[];
  sceneCorrections: SceneCorrection[];
  accuracyReport: AccuracyReport | null;
  mergeCandidates: SceneMergeCandidate[];
  mergeDecisions: MergeDecision[];
  department: MedicalDepartment;
  departmentDisplayName: string;
  gapMinutes: number;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  rawSelectMode: "move" | "copy";
  isCancelled: () => boolean;
  onOutputProgress?: (progress: { completed: number; total: number; message: string }) => void;
  onSecondaryProgress?: (progress: { current: number; total: number; fileName: string }) => void;
  onScenesUpdated?: (scenes: FieldScene[]) => void;
  dependencies?: Partial<RunnerDependencies>;
}): Promise<{
  scenes: FieldScene[];
  jpgBaseDirectory: FileSystemDirectoryHandle;
  stats: FieldStats;
  outputMode: "planned" | "rename";
}> {
  const runtime = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const plannedOutput = fastAnalyzeMode || scenes.some((scene) => !scene.sceneDir);
  let updatedScenes: FieldScene[];
  let resolvedJpgBaseDirectory: FileSystemDirectoryHandle;
  let totalJpg: number;

  if (plannedOutput) {
    const output = await runtime.executePlannedOutput({
      rootDirectory,
      scenes,
      rawFiles,
      boundaryDecisions,
      sceneCorrections,
      accuracyReport,
      checkpointId: `${rootDirectory.name}:${department}:${gapMinutes}:precise-v2`,
      isCancelled,
      onProgress: onOutputProgress,
    });
    updatedScenes = output.scenes;
    resolvedJpgBaseDirectory = output.jpgBaseDirectory;
    totalJpg = output.totalFiles;
  } else {
    if (!jpgBaseDirectory) {
      throw new Error("JPG 작업 폴더를 찾지 못했습니다. 촬영 폴더를 다시 열어주세요.");
    }
    updatedScenes = await runtime.renameScenes({ scenes, jpgBaseDirectory });
    resolvedJpgBaseDirectory = jpgBaseDirectory;
    totalJpg = updatedScenes.reduce((sum, scene) => sum + scene.fileCount, 0);
  }

  onScenesUpdated?.(updatedScenes);
  if (!qualityAnalysisEnabled && !profileClassificationEnabled) {
    return {
      scenes: updatedScenes,
      jpgBaseDirectory: resolvedJpgBaseDirectory,
      outputMode: plannedOutput ? "planned" : "rename",
      stats: {
        totalJpg,
        totalRaw: rawCount,
        totalScenes: updatedScenes.length,
        totalSubScenes: 0,
        totalProfile: 0,
        totalQualityReject: 0,
        selectedJpg: 0,
        selectedRawMoved: 0,
        rawMissing: 0,
      },
    };
  }

  const secondary = await runtime.runSecondaryAnalysis({
    scenes: updatedScenes,
    rootDir: rootDirectory,
    fieldJpgBaseDir: resolvedJpgBaseDirectory,
    fieldRawCount: rawCount,
    qualityAnalysisEnabled,
    profileClassificationEnabled,
    mergeCandidates,
    mergeDecisions,
    reportContext: {
      fastAnalyzeMode,
      department,
      departmentDisplayName,
      gapMinutes,
      departmentLogicEnabled,
      aiNamingEnabled,
      qualityAnalysisEnabled,
      profileClassificationEnabled,
      rawSelectMode,
    },
    isCancelled,
    onProgress: onSecondaryProgress,
    onScenesUpdated,
  });

  return {
    scenes: secondary.scenes,
    jpgBaseDirectory: resolvedJpgBaseDirectory,
    outputMode: plannedOutput ? "planned" : "rename",
    stats: {
      totalJpg: secondary.total,
      totalRaw: rawCount,
      totalScenes: secondary.scenes.length,
      totalSubScenes: 0,
      totalProfile: secondary.profileTotal,
      totalQualityReject: secondary.qualityRejectTotal,
      selectedJpg: 0,
      selectedRawMoved: 0,
      rawMissing: 0,
    },
  };
}
