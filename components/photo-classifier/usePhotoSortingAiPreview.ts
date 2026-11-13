"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { analyzeBrowserFieldFolder, type FieldFolderScanEntry } from "@/lib/photo-classifier/fieldFolderAnalysis";
import type { ExecutionMode } from "@/lib/photo-classifier/photoSource";
import type { FolderShootingPattern, SceneProposal, SceneWeightProfile } from "@/lib/photo-classifier/pattern-analysis";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import type { ClassificationUiMode } from "./ai-auto/ClassificationModeToggle";
import type { PhotoShootingMode } from "./PhotoShootingModeControl";

export function usePhotoSortingAiPreview({
  executionMode,
  rootDirectory,
  photoMode,
  classificationMode,
  step,
  departmentResolved,
  department,
  gapMinutes,
}: {
  executionMode: ExecutionMode;
  rootDirectory: FileSystemDirectoryHandle | null;
  photoMode: PhotoShootingMode;
  classificationMode: ClassificationUiMode;
  step: number;
  departmentResolved: boolean;
  department: MedicalDepartment;
  gapMinutes: number;
}) {
  const [weightProfile, setWeightProfile] = useState<SceneWeightProfile | null>(null);
  const [shootingPattern, setShootingPattern] = useState<FolderShootingPattern | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sceneProposals, setSceneProposals] = useState<SceneProposal[]>([]);
  const [scanFileCount, setScanFileCount] = useState(0);
  const scanEntriesRef = useRef<FieldFolderScanEntry[]>([]);

  const resetPreview = useCallback(() => {
    setShootingPattern(null);
    setSceneProposals([]);
    setScanFileCount(0);
    scanEntriesRef.current = [];
  }, []);

  useEffect(() => {
    if (executionMode === "REMOTE_WORKER") resetPreview();
  }, [executionMode, resetPreview]);

  const analyzeFolder = useCallback(async () => {
    if (!rootDirectory) return;
    setAnalyzing(true);
    setShootingPattern(null);
    setSceneProposals([]);
    try {
      const result = await analyzeBrowserFieldFolder({
        rootDirectory,
        department,
        fallbackGapMinutes: gapMinutes,
      });
      scanEntriesRef.current = result.entries;
      setScanFileCount(result.entries.length);
      if (!result.pattern) return;
      setShootingPattern(result.pattern);
      setWeightProfile(result.pattern.profile);
      setSceneProposals(result.proposals);
    } catch (error) {
      console.error("[ai-folder-analysis]", error);
    } finally {
      setAnalyzing(false);
    }
  }, [department, gapMinutes, rootDirectory]);

  useEffect(() => {
    if (executionMode !== "LOCAL_DIRECT"
      || !rootDirectory
      || photoMode !== "field"
      || classificationMode !== "ai-auto"
      || step !== 0
      || !departmentResolved) return;
    void analyzeFolder();
    // Folder/step/mode changes trigger the preview. Department and gap changes keep the
    // existing screen behavior and are picked up on the next explicit folder analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classificationMode, departmentResolved, executionMode, photoMode, rootDirectory, step]);

  return {
    weightProfile,
    setWeightProfile,
    shootingPattern,
    analyzing,
    sceneProposals,
    setSceneProposals,
    scanFileCount,
    scanEntriesRef,
  };
}
