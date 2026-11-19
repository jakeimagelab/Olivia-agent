"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { OliviaBridgeSceneState } from "@/components/olivia-bridge/OliviaBridgeSceneReviewContent";
import { analyzeBridgeScenes, type BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import { fetchPhotoDepartmentContext } from "@/lib/photo-classifier/departmentContextClient";
import {
  manualPhotoDepartmentResolution,
  type PhotoDepartmentResolution,
} from "@/lib/photo-classifier/departmentResolver";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import { folderFingerprint } from "@/lib/photo-classifier/scene-cache";

const EMPTY_SCENE_STATE: OliviaBridgeSceneState = {
  status: "idle",
  stage: "폴더를 선택해 주세요",
  completed: 0,
  total: 0,
  scenes: [],
  analysis: null,
};

const SCENE_ANALYSIS_CACHE_LIMIT = 5;
const sceneAnalysisCache = new Map<string, NonNullable<OliviaBridgeSceneState["analysis"]>>();

function rememberSceneAnalysis(key: string, analysis: NonNullable<OliviaBridgeSceneState["analysis"]>) {
  sceneAnalysisCache.delete(key);
  sceneAnalysisCache.set(key, analysis);
  while (sceneAnalysisCache.size > SCENE_ANALYSIS_CACHE_LIMIT) {
    const oldestKey = sceneAnalysisCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    sceneAnalysisCache.delete(oldestKey);
  }
}

export function useOliviaBridgeSceneAnalysis({
  enabled,
  hasActiveFolder,
  scanStatus,
  jpgs,
  folderPath,
  folderPathSegments,
  clientId,
  workflowRunId,
  setDepartmentResolution,
}: {
  enabled: boolean;
  hasActiveFolder: boolean;
  scanStatus: "idle" | "restoring" | "loading" | "ready" | "error";
  jpgs: readonly BridgeJpgFile[];
  folderPath: string;
  folderPathSegments: readonly string[];
  clientId?: string;
  workflowRunId?: string;
  setDepartmentResolution: (resolution: PhotoDepartmentResolution) => void;
}) {
  const [sceneState, setSceneState] = useState<OliviaBridgeSceneState>(EMPTY_SCENE_STATE);
  const [sceneRunKey, setSceneRunKey] = useState(0);
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [departmentError, setDepartmentError] = useState("");
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const jpgsRef = useRef(jpgs);
  jpgsRef.current = jpgs;
  const folderContextKey = hasActiveFolder && scanStatus === "ready" ? folderPath : "";
  const analysisKey = useMemo(() => folderFingerprint(folderPath, jpgs.map((photo) => ({
    name: photo.relativePath,
    size: photo.size,
    lastModified: photo.lastModified,
  }))), [folderPath, jpgs]);

  useEffect(() => {
    if (!folderContextKey) {
      setSceneState(EMPTY_SCENE_STATE);
      return;
    }
    setSceneState({
      status: "idle",
      stage: "사진 분류를 열면 선택한 JPG를 분석합니다",
      completed: 0,
      total: 0,
      scenes: [],
      analysis: null,
    });
  }, [folderContextKey]);

  useEffect(() => {
    if (enabled) return;
    setSceneState((previous) => previous.status === "running" ? {
      status: "idle",
      stage: "사진 분류를 열면 선택한 JPG를 분석합니다",
      completed: 0,
      total: 0,
      scenes: [],
      analysis: null,
    } : previous);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !hasActiveFolder || scanStatus !== "ready") return;
    const targetJpgs = jpgsRef.current;
    if (!targetJpgs.length) {
      setSceneState({ status: "idle", stage: "분류할 JPG를 선택해 주세요", completed: 0, total: 0, scenes: [], analysis: null });
      return;
    }
    const cachedAnalysis = sceneAnalysisCache.get(analysisKey);
    if (cachedAnalysis) {
      setSceneState({
        status: "complete",
        stage: "Scene 분류 계획 준비됨",
        completed: cachedAnalysis.files.length,
        total: cachedAnalysis.files.length,
        scenes: cachedAnalysis.scenes,
        analysis: cachedAnalysis,
      });
      return;
    }
    const controller = new AbortController();
    let lastProgressAt = 0;
    let lastProgressStage = "";
    setSceneState({ status: "running", stage: "AI Scene 사전 분석 준비", completed: 0, total: targetJpgs.length, scenes: [], analysis: null });
    void analyzeBridgeScenes({
      folderKey: folderPath,
      jpgs: targetJpgs,
      signal: controller.signal,
      onProgress: (completed, total, stage) => {
        if (controller.signal.aborted) return;
        const now = performance.now();
        if (stage === lastProgressStage && completed < total && now - lastProgressAt < 120) return;
        lastProgressAt = now;
        lastProgressStage = stage;
        setSceneState((previous) => ({ ...previous, status: "running", completed, total, stage }));
      },
    }).then((analysis) => {
      if (controller.signal.aborted) return;
      rememberSceneAnalysis(analysisKey, analysis);
      setSceneState({ status: "complete", stage: "Scene 분류 계획 준비됨", completed: targetJpgs.length, total: targetJpgs.length, scenes: analysis.scenes, analysis });
    })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSceneState({ status: "error", stage: "Scene 분석 오류", completed: 0, total: targetJpgs.length, scenes: [], analysis: null, error: error instanceof Error ? error.message : "Scene 분석에 실패했습니다." });
      });
    return () => controller.abort();
  }, [analysisKey, enabled, folderPath, hasActiveFolder, scanStatus, sceneRunKey]);

  useEffect(() => {
    if (!hasActiveFolder || !folderPathSegments.length || scanStatus !== "ready") return;
    const controller = new AbortController();
    setDepartmentLoading(true);
    setDepartmentError("");
    setDepartmentPickerOpen(false);
    void fetchPhotoDepartmentContext({ clientId, workflowRunId, folderPath: folderPathSegments }, { signal: controller.signal })
      .then((resolution) => {
        setDepartmentResolution(resolution);
        setDepartmentPickerOpen(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDepartmentResolution({ status: "unknown", evidence: [] });
        setDepartmentPickerOpen(false);
        setDepartmentError(error instanceof Error ? error.message : "진료과 정보를 확인하지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDepartmentLoading(false);
      });
    return () => controller.abort();
  }, [clientId, folderPathSegments, hasActiveFolder, scanStatus, setDepartmentResolution, workflowRunId]);

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
