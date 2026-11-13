"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { runBrowserFieldClassification } from "@/lib/photo-classifier/browserFieldClassificationRunner";
import type { SplitRawFile } from "@/lib/photo-classifier/browserFileOps";
import { runBrowserFieldReviewConfirmation } from "@/lib/photo-classifier/browserFieldReviewRunner";
import type {
  AccuracyReport,
  ClassificationJobState,
  SceneBoundaryDecision,
  SceneCorrection,
} from "@/lib/photo-classifier/hybrid-types";
import type { SceneWeightProfile } from "@/lib/photo-classifier/pattern-analysis";
import type { MergeDecision, SceneMergeCandidate } from "@/lib/photo-classifier/scene-merge-types";
import { DEPARTMENT_DISPLAY, type FieldScene, type FieldStats, type MedicalDepartment } from "@/lib/photo-classifier/types";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import type { PhotoClassificationProgress } from "./usePhotoClassificationProgress";

export const PHOTO_CLASSIFY_JOB_ID = "photo-classify";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type FieldClassificationSettings = {
  department: MedicalDepartment;
  gapMinutes: number;
  fastAnalyzeMode: boolean;
  aiNamingEnabled: boolean;
  departmentLogicEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  rawSelectMode: "move" | "copy";
  weightProfile: SceneWeightProfile | null;
};

type FieldReviewState = {
  scenes: FieldScene[];
  jpgBaseDirectory: FileSystemDirectoryHandle | null;
  rawFiles: SplitRawFile[];
  rawCount: number;
  boundaryDecisions: SceneBoundaryDecision[];
  sceneCorrections: SceneCorrection[];
  accuracyReport: AccuracyReport | null;
  mergeCandidates: SceneMergeCandidate[];
  mergeDecisions: MergeDecision[];
};

export function usePhotoSortingFieldActions({
  rootDirectory,
  departmentResolved,
  announceCompletion,
  settings,
  review,
  cancelRef,
  classificationAbortRef,
  updateProgress,
  setStep,
  setDirectoryError,
  setDepartmentPickerOpen,
  setBridgePlanSummary,
  setCopyLog,
  setBoundaryDecisions,
  setSceneCorrections,
  setClassificationJobState,
  setRawCount,
  setRawFiles,
  setScenes,
  setJpgBaseDirectory,
  setStats,
  analyzeScenes,
}: {
  rootDirectory: FileSystemDirectoryHandle | null;
  departmentResolved: boolean;
  announceCompletion: boolean;
  settings: FieldClassificationSettings;
  review: FieldReviewState;
  cancelRef: MutableRefObject<boolean>;
  classificationAbortRef: MutableRefObject<AbortController | null>;
  updateProgress: (next: PhotoClassificationProgress) => void;
  setStep: StateSetter<number>;
  setDirectoryError: StateSetter<string>;
  setDepartmentPickerOpen: StateSetter<boolean>;
  setBridgePlanSummary: StateSetter<{ sceneCount: number; jpgCount: number; reviewCount: number } | null>;
  setCopyLog: StateSetter<string[]>;
  setBoundaryDecisions: StateSetter<SceneBoundaryDecision[]>;
  setSceneCorrections: StateSetter<SceneCorrection[]>;
  setClassificationJobState: StateSetter<ClassificationJobState>;
  setRawCount: StateSetter<number>;
  setRawFiles: StateSetter<SplitRawFile[]>;
  setScenes: StateSetter<FieldScene[]>;
  setJpgBaseDirectory: StateSetter<FileSystemDirectoryHandle | null>;
  setStats: StateSetter<FieldStats | null>;
  analyzeScenes: (scenes: FieldScene[]) => Promise<void>;
}) {
  const {
    department,
    gapMinutes,
    fastAnalyzeMode,
    aiNamingEnabled,
    departmentLogicEnabled,
    qualityAnalysisEnabled,
    profileClassificationEnabled,
    rawSelectMode,
    weightProfile,
  } = settings;
  const {
    scenes,
    jpgBaseDirectory,
    rawFiles,
    rawCount,
    boundaryDecisions: currentBoundaryDecisions,
    sceneCorrections: currentSceneCorrections,
    accuracyReport,
    mergeCandidates,
    mergeDecisions,
  } = review;

  const classifyField = useCallback(async () => {
    if (!rootDirectory) return;
    if (!departmentResolved) {
      setDirectoryError("진료과를 확인해야 분류를 시작할 수 있습니다.");
      setDepartmentPickerOpen(true);
      return;
    }

    setBridgePlanSummary(null);
    setStep(1);
    cancelRef.current = false;
    setCopyLog([]);
    setBoundaryDecisions([]);
    setSceneCorrections([]);

    try {
      useBackgroundJobsStore.getState().startJob({
        id: PHOTO_CLASSIFY_JOB_ID,
        label: "사진 분류 중",
        cur: 0,
        total: 0,
        status: "running",
        returnPath: "/photo-sorting?mode=classification",
        cancelRef,
      });
      classificationAbortRef.current?.abort();
      const abortController = new AbortController();
      classificationAbortRef.current = abortController;
      const classification = await runBrowserFieldClassification({
        rootDirectory,
        department,
        gapMinutes,
        fastAnalyzeMode,
        aiNamingEnabled,
        departmentLogicEnabled,
        weightProfile,
        signal: abortController.signal,
        isCancelled: () => cancelRef.current,
        onStateChange: setClassificationJobState,
        onProgress: updateProgress,
        onFilesScanned: (rawFiles) => {
          setRawCount(rawFiles.length);
          setRawFiles(rawFiles);
        },
      });
      setBoundaryDecisions(classification.boundaryDecisions);
      setCopyLog(classification.logs);
      if (classification.status === "cancelled") {
        useBackgroundJobsStore.getState().finishJob(PHOTO_CLASSIFY_JOB_ID, "cancelled");
        return;
      }

      const newScenes = classification.scenes;
      setScenes(newScenes);
      setStep(2);
      useBackgroundJobsStore.getState().finishJob(PHOTO_CLASSIFY_JOB_ID, "done");

      if (announceCompletion) {
        const needsReviewCount = newScenes.filter((scene) => scene.boundaryBefore?.needsReview).length;
        const summary = `사진 분류 완료\n\n총 사진 ${classification.total}장\n분류 Scene ${newScenes.length}개${needsReviewCount > 0 ? `\n확인 필요 ${needsReviewCount}개` : ""}`;
        useOliviaConversationStore.getState().appendMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: summary,
          blocks: [{ type: "text", text: summary }],
          createdAt: new Date().toISOString(),
          status: "complete",
        });
      }

      if (newScenes.length > 0 && (
        (fastAnalyzeMode && (aiNamingEnabled || departmentLogicEnabled))
        || (department === "dermatology" && departmentLogicEnabled)
      )) {
        void analyzeScenes(newScenes);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCopyLog((previous) => [
        ...previous,
        `❌ 오류: 사진 분류를 진행하지 못했습니다 — ${message}`,
      ]);
      setClassificationJobState("WAITING_REVIEW");
      useBackgroundJobsStore.getState().finishJob(PHOTO_CLASSIFY_JOB_ID, "error");
    }
  }, [
    analyzeScenes,
    aiNamingEnabled,
    announceCompletion,
    cancelRef,
    classificationAbortRef,
    department,
    departmentLogicEnabled,
    departmentResolved,
    fastAnalyzeMode,
    gapMinutes,
    rootDirectory,
    setBoundaryDecisions,
    setBridgePlanSummary,
    setClassificationJobState,
    setCopyLog,
    setDepartmentPickerOpen,
    setDirectoryError,
    setRawCount,
    setRawFiles,
    setSceneCorrections,
    setScenes,
    setStep,
    updateProgress,
    weightProfile,
  ]);

  const confirmScenes = useCallback(async () => {
    if (!rootDirectory) return;
    setStep(3);
    setClassificationJobState("APPROVED");
    try {
      updateProgress({ cur: 0, total: 0, msg: "폴더 정리 중..." });
      const result = await runBrowserFieldReviewConfirmation({
        rootDirectory,
        scenes,
        jpgBaseDirectory,
        rawFiles,
        rawCount,
        fastAnalyzeMode,
        qualityAnalysisEnabled,
        profileClassificationEnabled,
        boundaryDecisions: currentBoundaryDecisions,
        sceneCorrections: currentSceneCorrections,
        accuracyReport,
        mergeCandidates,
        mergeDecisions,
        department,
        departmentDisplayName: DEPARTMENT_DISPLAY[department],
        gapMinutes,
        departmentLogicEnabled,
        aiNamingEnabled,
        rawSelectMode,
        isCancelled: () => cancelRef.current,
        onOutputProgress: ({ completed, total, message }) => {
          updateProgress({ cur: completed, total, msg: message });
        },
        onSecondaryProgress: ({ current, total, fileName }) => {
          updateProgress({ cur: current, total, msg: `분석: ${fileName}` });
        },
        onScenesUpdated: setScenes,
      });
      setJpgBaseDirectory(result.jpgBaseDirectory);
      setScenes(result.scenes);
      setStats(result.stats);
      setStep(4);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCopyLog((previous) => [
        ...previous,
        `❌ 오류: 폴더 정리를 완료하지 못했습니다 — ${message}`,
        "일부 파일은 이미 이동됐을 수 있어요 — REPORT 폴더의 file_operation_journal.json을 확인해주세요.",
      ]);
      setStep(2);
      setClassificationJobState("WAITING_REVIEW");
    }
  }, [
    accuracyReport,
    aiNamingEnabled,
    cancelRef,
    currentBoundaryDecisions,
    currentSceneCorrections,
    department,
    departmentLogicEnabled,
    fastAnalyzeMode,
    gapMinutes,
    jpgBaseDirectory,
    mergeCandidates,
    mergeDecisions,
    profileClassificationEnabled,
    qualityAnalysisEnabled,
    rawCount,
    rawFiles,
    rawSelectMode,
    rootDirectory,
    scenes,
    setClassificationJobState,
    setCopyLog,
    setJpgBaseDirectory,
    setScenes,
    setStats,
    setStep,
    updateProgress,
  ]);

  return { classifyField, confirmScenes };
}
