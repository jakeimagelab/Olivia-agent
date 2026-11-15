"use client";

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";

import type { BridgeToolKey } from "@/components/olivia-bridge/OliviaBridgeActionBar";
import type { OliviaBridgeSceneState } from "@/components/olivia-bridge/OliviaBridgeSceneReviewContent";
import {
  rebuildBridgeSceneAnalysis,
  type BridgeJpgFile,
} from "@/lib/photo-bridge/bridgeFiles";
import {
  createBridgeClassificationPlan,
  type BridgeClassificationPlan,
} from "@/lib/photo-bridge/classificationPlan";
import type { PhotoDepartmentResolution } from "@/lib/photo-classifier/departmentResolver";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

export function resolveBridgeScenePlanDisabledReason(input: {
  selectedIdCount: number;
  selectionSource: BridgeSelectionSource;
  sceneState: OliviaBridgeSceneState;
  selectedSceneAnalysisReady: boolean;
  departmentResolution: PhotoDepartmentResolution;
  departmentLoading: boolean;
  adobeSelectionLoading: boolean;
}) {
  if (input.adobeSelectionLoading) return "Adobe Bridge의 별점·컬러를 확인하고 있습니다.";
  if (input.selectedIdCount === 0) {
    return input.selectionSource === "adobe"
      ? "어도비 기준에서 별점·컬러가 있는 JPG가 없습니다. 셀렉 기준을 바꾸거나 Adobe Bridge에서 표시해 주세요."
      : "분류할 JPG를 먼저 선택해 주세요.";
  }
  if (input.sceneState.status === "running") {
    return `${input.sceneState.stage} · ${input.sceneState.completed.toLocaleString("ko-KR")}/${input.sceneState.total.toLocaleString("ko-KR")}`;
  }
  if (input.sceneState.status === "error") {
    return input.sceneState.error ?? "Scene 분석에 실패했습니다. 다시 시도해 주세요.";
  }
  if (!input.selectedSceneAnalysisReady) return "선택한 JPG의 Scene 계획을 준비하고 있습니다.";
  if (input.departmentLoading) return "진료과 정보를 확인하고 있습니다.";
  if (input.departmentResolution.status !== "resolved") return "진료과를 선택해야 Scene 계획을 적용할 수 있습니다.";
  return null;
}

export function useOliviaBridgeSceneReviewModel({
  jpgs,
  selectedIds,
  selectionSource,
  sceneReviewOpen,
  sceneState,
  photoDepartmentResolution,
  departmentLoading,
  adobeSelectionLoading,
  hasActiveFolder,
  activeFolder,
  folderPath,
  stageBridgeClassificationPlan,
  setSceneReviewOpen,
  setToolKey,
  reportScenePlanError,
}: {
  jpgs: readonly BridgeJpgFile[];
  selectedIds: ReadonlySet<string>;
  selectionSource: BridgeSelectionSource;
  sceneReviewOpen: boolean;
  sceneState: OliviaBridgeSceneState;
  photoDepartmentResolution: PhotoDepartmentResolution;
  departmentLoading: boolean;
  adobeSelectionLoading: boolean;
  hasActiveFolder: boolean;
  activeFolder: FileSystemDirectoryHandle | null;
  folderPath: string;
  stageBridgeClassificationPlan: (plan: BridgeClassificationPlan) => void;
  setSceneReviewOpen: Dispatch<SetStateAction<boolean>>;
  setToolKey: Dispatch<SetStateAction<BridgeToolKey | undefined>>;
  reportScenePlanError: (error: unknown) => void;
}) {
  const scenePhotoByName = useMemo(() => new Map(jpgs.map((photo) => [photo.name, photo])), [jpgs]);
  const selectedSceneAnalysis = useMemo(() => {
    if (!sceneReviewOpen || !sceneState.analysis || !selectedIds.size) return null;
    const selectedFiles = sceneState.analysis.files.filter((file) => selectedIds.has(file.id));
    return selectedFiles.length === sceneState.analysis.files.length
      ? sceneState.analysis
      : rebuildBridgeSceneAnalysis(selectedFiles);
  }, [sceneReviewOpen, sceneState.analysis, selectedIds]);
  const selectedScenes = useMemo(() => selectedSceneAnalysis?.scenes ?? [], [selectedSceneAnalysis]);
  const sceneBoundaryReviewCount = useMemo(
    () => selectedScenes.filter((scene) => scene.needsReview).length,
    [selectedScenes],
  );
  const sceneAnalysisReady = sceneState.status === "complete" && Boolean(sceneState.analysis);
  const selectedSceneAnalysisReady = sceneAnalysisReady
    && Boolean(selectedSceneAnalysis)
    && selectedScenes.length > 0;
  const scenePlanDisabledReason = resolveBridgeScenePlanDisabledReason({
    selectedIdCount: selectedIds.size,
    selectionSource,
    sceneState,
    selectedSceneAnalysisReady,
    departmentResolution: photoDepartmentResolution,
    departmentLoading,
    adobeSelectionLoading,
  });
  const scenePlanReady = scenePlanDisabledReason === null;

  const applyScenePlan = useCallback(() => {
    if (
      !hasActiveFolder
      || !selectedSceneAnalysis
      || !scenePlanReady
      || photoDepartmentResolution.status !== "resolved"
    ) return;
    try {
      if (activeFolder) {
        stageBridgeClassificationPlan(createBridgeClassificationPlan({
          folderKey: folderPath,
          folderName: activeFolder.name,
          directory: activeFolder,
          analysis: selectedSceneAnalysis,
          departmentResolution: photoDepartmentResolution,
        }));
      }
      setSceneReviewOpen(false);
      setToolKey("classification");
    } catch (error) {
      reportScenePlanError(error);
    }
  }, [activeFolder, folderPath, hasActiveFolder, photoDepartmentResolution, reportScenePlanError, scenePlanReady, selectedSceneAnalysis, setSceneReviewOpen, setToolKey, stageBridgeClassificationPlan]);

  return {
    scenePhotoByName,
    selectedSceneAnalysis,
    selectedScenes,
    sceneBoundaryReviewCount,
    selectedSceneAnalysisReady,
    scenePlanReady,
    scenePlanDisabledReason,
    applyScenePlan,
  };
}
