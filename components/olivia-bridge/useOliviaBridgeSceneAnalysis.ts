"use client";

import { useCallback, useEffect, useState } from "react";

import type { OliviaBridgeSceneState } from "@/components/olivia-bridge/OliviaBridgeSceneReviewContent";
import { analyzeBridgeScenes, type BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import { fetchPhotoDepartmentContext } from "@/lib/photo-classifier/departmentContextClient";
import {
  manualPhotoDepartmentResolution,
  type PhotoDepartmentResolution,
} from "@/lib/photo-classifier/departmentResolver";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

const EMPTY_SCENE_STATE: OliviaBridgeSceneState = {
  status: "idle",
  stage: "폴더를 선택해 주세요",
  completed: 0,
  total: 0,
  scenes: [],
  analysis: null,
};

export function useOliviaBridgeSceneAnalysis({
  hasActiveFolder,
  scanStatus,
  jpgs,
  folderPath,
  activeFolderName,
  clientId,
  workflowRunId,
  setDepartmentResolution,
}: {
  hasActiveFolder: boolean;
  scanStatus: "idle" | "restoring" | "loading" | "ready" | "error";
  jpgs: readonly BridgeJpgFile[];
  folderPath: string;
  activeFolderName: string;
  clientId?: string;
  workflowRunId?: string;
  setDepartmentResolution: (resolution: PhotoDepartmentResolution) => void;
}) {
  const [sceneState, setSceneState] = useState<OliviaBridgeSceneState>(EMPTY_SCENE_STATE);
  const [sceneRunKey, setSceneRunKey] = useState(0);
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [departmentError, setDepartmentError] = useState("");
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);

  useEffect(() => {
    if (!hasActiveFolder || scanStatus !== "ready") {
      setSceneState(EMPTY_SCENE_STATE);
      return;
    }
    if (!jpgs.length) {
      setSceneState({ status: "complete", stage: "분석할 JPG가 없습니다", completed: 0, total: 0, scenes: [], analysis: null });
      return;
    }
    const controller = new AbortController();
    setSceneState({ status: "running", stage: "AI Scene 사전 분석 준비", completed: 0, total: jpgs.length, scenes: [], analysis: null });
    void analyzeBridgeScenes({
      folderKey: folderPath,
      jpgs,
      signal: controller.signal,
      onProgress: (completed, total, stage) => setSceneState((previous) => ({ ...previous, status: "running", completed, total, stage })),
    }).then((analysis) => setSceneState({ status: "complete", stage: "Scene 분류 계획 준비됨", completed: jpgs.length, total: jpgs.length, scenes: analysis.scenes, analysis }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSceneState({ status: "error", stage: "Scene 분석 오류", completed: 0, total: jpgs.length, scenes: [], analysis: null, error: error instanceof Error ? error.message : "Scene 분석에 실패했습니다." });
      });
    return () => controller.abort();
  }, [folderPath, hasActiveFolder, jpgs, scanStatus, sceneRunKey]);

  useEffect(() => {
    if (!hasActiveFolder || !activeFolderName || scanStatus !== "ready") return;
    const controller = new AbortController();
    setDepartmentLoading(true);
    setDepartmentError("");
    setDepartmentPickerOpen(false);
    void fetchPhotoDepartmentContext({ clientId, workflowRunId, folderName: activeFolderName }, { signal: controller.signal })
      .then((resolution) => {
        setDepartmentResolution(resolution);
        setDepartmentPickerOpen(resolution.status !== "resolved");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDepartmentResolution({ status: "unknown", evidence: [] });
        setDepartmentPickerOpen(true);
        setDepartmentError(error instanceof Error ? error.message : "진료과 정보를 확인하지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDepartmentLoading(false);
      });
    return () => controller.abort();
  }, [activeFolderName, clientId, hasActiveFolder, scanStatus, setDepartmentResolution, workflowRunId]);

  const chooseDepartment = useCallback((department: MedicalDepartment) => {
    setDepartmentResolution(manualPhotoDepartmentResolution(department));
    setDepartmentError("");
    setDepartmentPickerOpen(false);
  }, [setDepartmentResolution]);
  const retrySceneAnalysis = useCallback(() => setSceneRunKey((value) => value + 1), []);
  const openDepartmentPicker = useCallback(() => setDepartmentPickerOpen(true), []);
  const reportScenePlanError = useCallback((error: unknown) => {
    setSceneState((previous) => ({
      ...previous,
      status: "error",
      stage: "Scene 계획 적용 오류",
      error: error instanceof Error ? error.message : "Scene 계획을 적용하지 못했습니다.",
    }));
  }, []);

  return {
    sceneState,
    departmentLoading,
    departmentError,
    departmentPickerOpen,
    chooseDepartment,
    retrySceneAnalysis,
    openDepartmentPicker,
    reportScenePlanError,
  };
}
