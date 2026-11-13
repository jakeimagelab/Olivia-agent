"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { SplitRawFile } from "@/lib/photo-classifier/browserFileOps";
import type {
  ClassificationJobState,
  SceneBoundaryDecision,
  SceneCorrection,
} from "@/lib/photo-classifier/hybrid-types";
import type { MergeDecision, SceneMergeCandidate } from "@/lib/photo-classifier/scene-merge-types";
import type { FieldScene, FieldStats, MedicalDepartment } from "@/lib/photo-classifier/types";
import type { BridgeClassificationPlan } from "@/lib/photo-bridge/classificationPlan";
import { prepareBridgeClassificationPlan } from "@/lib/photo-bridge/classificationPlanApply";
import type { PhotoDepartmentResolution } from "@/lib/photo-classifier/departmentResolver";
import type { PhotoClassificationProgress } from "./usePhotoClassificationProgress";
import type { PhotoShootingMode } from "./PhotoShootingModeControl";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type BridgePlanSummary = { sceneCount: number; jpgCount: number; reviewCount: number };

export function usePhotoSortingBridgePlan({
  enabled,
  pendingPlan,
  takePlan,
  currentLocalFolder,
  clientId,
  workflowRunId,
  departmentContextKeyRef,
  dismissSavedSession,
  updateProgress,
  setCurrentLocalFolder,
  setRootDirectory,
  setPhotoMode,
  setFastAnalyzeMode,
  setDepartment,
  setDepartmentResolution,
  setDepartmentContextError,
  setDepartmentPickerOpen,
  setStep,
  setClassificationJobState,
  setBridgePlanSummary,
  setDirectoryError,
  setJpgBaseDirectory,
  setRawFiles,
  setRawCount,
  setBoundaryDecisions,
  setSceneCorrections,
  setMergeCandidates,
  setDismissedCandidates,
  setMergeDecisions,
  setScenes,
  setStats,
  setCopyLog,
}: {
  enabled: boolean;
  pendingPlan: BridgeClassificationPlan | null;
  takePlan: () => BridgeClassificationPlan | null;
  currentLocalFolder: FileSystemDirectoryHandle | null;
  clientId: string;
  workflowRunId: string;
  departmentContextKeyRef: MutableRefObject<string>;
  dismissSavedSession: () => void;
  updateProgress: (next: PhotoClassificationProgress) => void;
  setCurrentLocalFolder: (folder: FileSystemDirectoryHandle | null) => void;
  setRootDirectory: StateSetter<FileSystemDirectoryHandle | null>;
  setPhotoMode: StateSetter<PhotoShootingMode>;
  setFastAnalyzeMode: StateSetter<boolean>;
  setDepartment: StateSetter<MedicalDepartment>;
  setDepartmentResolution: (resolution: PhotoDepartmentResolution) => void;
  setDepartmentContextError: StateSetter<string>;
  setDepartmentPickerOpen: StateSetter<boolean>;
  setStep: StateSetter<number>;
  setClassificationJobState: StateSetter<ClassificationJobState>;
  setBridgePlanSummary: StateSetter<BridgePlanSummary | null>;
  setDirectoryError: StateSetter<string>;
  setJpgBaseDirectory: StateSetter<FileSystemDirectoryHandle | null>;
  setRawFiles: StateSetter<SplitRawFile[]>;
  setRawCount: StateSetter<number>;
  setBoundaryDecisions: StateSetter<SceneBoundaryDecision[]>;
  setSceneCorrections: StateSetter<SceneCorrection[]>;
  setMergeCandidates: StateSetter<SceneMergeCandidate[]>;
  setDismissedCandidates: StateSetter<Set<string>>;
  setMergeDecisions: StateSetter<MergeDecision[]>;
  setScenes: StateSetter<FieldScene[]>;
  setStats: StateSetter<FieldStats | null>;
  setCopyLog: StateSetter<string[]>;
}) {
  useEffect(() => {
    if (!enabled || !pendingPlan) return;
    const plan = takePlan();
    if (!plan) return;

    setBridgePlanSummary(null);
    setDirectoryError("");
    setPhotoMode("field");
    setFastAnalyzeMode(false);
    dismissSavedSession();
    setStep(1);
    updateProgress({ cur: 0, total: plan.files.length, msg: "Bridge Scene 계획 확인 중..." });
    setClassificationJobState("CREATING_SCENES");

    void (async () => {
      try {
        const prepared = await prepareBridgeClassificationPlan({ currentLocalFolder, plan });
        departmentContextKeyRef.current = `${clientId}:${workflowRunId}:${plan.directory.name}`;
        setCurrentLocalFolder(plan.directory);
        setDepartment(plan.departmentResolution.department);
        setDepartmentResolution(plan.departmentResolution);
        setDepartmentContextError("");
        setDepartmentPickerOpen(false);
        setRootDirectory(plan.directory);
        setJpgBaseDirectory(null);
        setRawFiles(prepared.rawFiles);
        setRawCount(prepared.rawFiles.length);
        setBoundaryDecisions(plan.boundaries);
        setSceneCorrections([]);
        setMergeCandidates([]);
        setDismissedCandidates(new Set());
        setMergeDecisions([]);
        setScenes(prepared.scenes);
        setStats(prepared.stats);
        setCopyLog(prepared.copyLog);
        updateProgress({
          cur: plan.files.length,
          total: plan.files.length,
          msg: "Bridge Scene 계획 적용 완료",
        });
        setClassificationJobState("WAITING_REVIEW");
        setBridgePlanSummary(prepared.summary);
        setStep(2);
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Bridge Scene 계획을 적용하지 못했습니다.";
        setBridgePlanSummary(null);
        setScenes([]);
        setBoundaryDecisions([]);
        setRawFiles([]);
        setRawCount(0);
        setStats(null);
        setCopyLog([`❌ ${message}`]);
        setClassificationJobState("FAILED");
        setDirectoryError(message);
        setRootDirectory(plan.directory);
        setStep(0);
      }
    })();
  }, [
    clientId,
    currentLocalFolder,
    departmentContextKeyRef,
    dismissSavedSession,
    enabled,
    pendingPlan,
    setBoundaryDecisions,
    setBridgePlanSummary,
    setClassificationJobState,
    setCopyLog,
    setCurrentLocalFolder,
    setDepartment,
    setDepartmentContextError,
    setDepartmentPickerOpen,
    setDepartmentResolution,
    setDirectoryError,
    setDismissedCandidates,
    setFastAnalyzeMode,
    setJpgBaseDirectory,
    setMergeCandidates,
    setMergeDecisions,
    setPhotoMode,
    setRawCount,
    setRawFiles,
    setRootDirectory,
    setSceneCorrections,
    setScenes,
    setStats,
    setStep,
    takePlan,
    updateProgress,
    workflowRunId,
  ]);
}
