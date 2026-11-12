"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createSavedSortingSession,
  readSavedSortingSession,
  removeSavedSortingSession,
  writeSavedSortingSession,
  type SavedSortingSession,
} from "@/lib/photo-classifier/sortingSession";
import type { FieldScene, FieldStats, MedicalDepartment } from "@/lib/photo-classifier/types";
import type {
  ClassificationJobState,
  SceneBoundaryDecision,
  SceneCorrection,
} from "@/lib/photo-classifier/hybrid-types";

export function usePhotoSortingSession({
  step,
  rootDirName,
  department,
  gapMinutes,
  fastAnalyzeMode,
  departmentLogicEnabled,
  aiNamingEnabled,
  qualityAnalysisEnabled,
  profileClassificationEnabled,
  rawSelectMode,
  fieldRawCount,
  fieldStats,
  classificationJobState,
  boundaryDecisions,
  sceneCorrections,
  fieldScenes,
}: {
  step: number;
  rootDirName: string;
  department: MedicalDepartment;
  gapMinutes: number;
  fastAnalyzeMode: boolean;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  rawSelectMode: "move" | "copy";
  fieldRawCount: number;
  fieldStats: FieldStats | null;
  classificationJobState: ClassificationJobState;
  boundaryDecisions: SceneBoundaryDecision[];
  sceneCorrections: SceneCorrection[];
  fieldScenes: FieldScene[];
}) {
  const [savedSession, setSavedSession] = useState<SavedSortingSession | null>(null);

  useEffect(() => {
    try {
      const session = readSavedSortingSession(localStorage);
      if (session) setSavedSession(session);
    } catch (error) {
      console.error("[OLIVIA] Suppressed error", error);
    }
  }, []);

  useEffect(() => {
    if (step < 2) return;
    try {
      writeSavedSortingSession(createSavedSortingSession({
        step,
        rootDirName,
        department,
        gapMinutes,
        fastAnalyzeMode,
        departmentLogicEnabled,
        aiNamingEnabled,
        qualityAnalysisEnabled,
        profileClassificationEnabled,
        rawSelectMode,
        fieldRawCount,
        fieldStats,
        classificationJobState,
        boundaryDecisions,
        sceneCorrections,
        fieldScenes,
      }), localStorage);
    } catch (error) {
      console.error("[OLIVIA] Suppressed error", error);
    }
  }, [
    aiNamingEnabled,
    boundaryDecisions,
    classificationJobState,
    department,
    departmentLogicEnabled,
    fastAnalyzeMode,
    fieldRawCount,
    fieldScenes,
    fieldStats,
    gapMinutes,
    profileClassificationEnabled,
    qualityAnalysisEnabled,
    rawSelectMode,
    rootDirName,
    sceneCorrections,
    step,
  ]);

  const dismissSavedSession = useCallback(() => setSavedSession(null), []);
  const clearSavedSession = useCallback(() => {
    try {
      removeSavedSortingSession(localStorage);
    } catch (error) {
      console.error("[OLIVIA] Suppressed error", error);
    }
    setSavedSession(null);
  }, []);

  return {
    clearSavedSession,
    dismissSavedSession,
    savedSession,
  };
}
