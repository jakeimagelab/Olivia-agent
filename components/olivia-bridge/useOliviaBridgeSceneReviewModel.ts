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

export function useOliviaBridgeSceneReviewModel({
  jpgs,
  selectedIds,
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
    return rebuildBridgeSceneAnalysis(
      sceneState.analysis.files.filter((file) => selectedIds.has(file.id)),
    );
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
  const scenePlanReady = selectedSceneAnalysisReady
    && photoDepartmentResolution.status === "resolved"
    && !departmentLoading
    && !adobeSelectionLoading;

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
    applyScenePlan,
  };
}
