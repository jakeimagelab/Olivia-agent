import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { copyFileHandle } from "@/lib/photo-classifier/browserFileOps";
import type { SceneBoundaryDecision, SceneCorrection } from "@/lib/photo-classifier/hybrid-types";
import type { MergeDecision, SceneMergeCandidate } from "@/lib/photo-classifier/scene-merge-types";
import {
  createApproveSceneCorrection,
  createMergeSceneCorrection,
  createRenameSceneCorrection,
  markBoundaryAsManuallyMerged,
  mergePlannedFieldScenes,
  splitPlannedFieldScene,
} from "@/lib/photo-classifier/sceneReviewEdits";
import type { FieldScene } from "@/lib/photo-classifier/types";
import { usePhotoClassificationActionsStore } from "@/lib/store/usePhotoClassificationActionsStore";

export function useFieldSceneReviewActions({
  actionsEnabled,
  rootDirectory,
  jpgBaseDirectory,
  scenes,
  mergeCandidates,
  setScenes,
  setBoundaryDecisions,
  setSceneCorrections,
  setDismissedCandidates,
  setMergeDecisions,
  setSplitPositions,
  startClassification,
  submitNaturalLanguageRequest,
}: {
  actionsEnabled: boolean;
  rootDirectory: FileSystemDirectoryHandle | null;
  jpgBaseDirectory: FileSystemDirectoryHandle | null;
  scenes: FieldScene[];
  mergeCandidates: SceneMergeCandidate[];
  setScenes: Dispatch<SetStateAction<FieldScene[]>>;
  setBoundaryDecisions: Dispatch<SetStateAction<SceneBoundaryDecision[]>>;
  setSceneCorrections: Dispatch<SetStateAction<SceneCorrection[]>>;
  setDismissedCandidates: Dispatch<SetStateAction<Set<string>>>;
  setMergeDecisions: Dispatch<SetStateAction<MergeDecision[]>>;
  setSplitPositions: Dispatch<SetStateAction<Record<number, number>>>;
  startClassification: () => Promise<void>;
  submitNaturalLanguageRequest: (message: string) => Promise<void>;
}) {
  const scenesRef = useRef(scenes);
  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  const mergeScenes = useCallback(async (firstIndex: number, secondIndex: number, candidateId?: string) => {
    const firstScene = scenes[firstIndex];
    const secondScene = scenes[secondIndex];
    if (!firstScene || !secondScene) return;

    if (candidateId) {
      const candidate = mergeCandidates.find((item) => item.id === candidateId);
      if (candidate) {
        setMergeDecisions((previous) => [...previous, {
          candidateId: candidate.id,
          userAction: "merge",
          fromFolderName: candidate.fromFolderName,
          toFolderName: candidate.toFolderName,
          fromSceneType: candidate.fromSceneType,
          toSceneType: candidate.toSceneType,
          mergeScore: candidate.mergeScore,
          matchedSignals: candidate.matchedSignals,
          blockedSignals: candidate.blockedSignals,
          recommendedAction: candidate.recommendedAction,
        }]);
      }
    }

    const affectedNames = new Set([firstScene.folderName, secondScene.folderName]);
    setDismissedCandidates((previous) => {
      const next = new Set(previous);
      for (const candidate of mergeCandidates) {
        if (affectedNames.has(candidate.fromFolderName) || affectedNames.has(candidate.toFolderName)) {
          next.add(candidate.id);
        }
      }
      return next;
    });

    if (!firstScene.sceneDir || !secondScene.sceneDir) {
      const correction = createMergeSceneCorrection(secondScene, rootDirectory?.name ?? "local");
      if (correction) {
        setSceneCorrections((previous) => [...previous, correction]);
        setBoundaryDecisions((previous) => markBoundaryAsManuallyMerged(previous, correction.boundaryIndex));
      }
      setScenes((previous) => mergePlannedFieldScenes(previous, firstIndex, secondIndex));
      return;
    }

    if (!jpgBaseDirectory) return;
    for (const file of secondScene.files) {
      try {
        await copyFileHandle(file.handle, firstScene.sceneDir, file.name);
        await secondScene.sceneDir.removeEntry(file.name);
      } catch (error) {
        console.error("[OLIVIA] Suppressed error", error);
      }
    }
    try {
      await jpgBaseDirectory.removeEntry(secondScene.folderName);
    } catch (error) {
      console.error("[OLIVIA] Suppressed error", error);
    }
    setScenes((previous) => {
      const next = [...previous];
      next[firstIndex] = {
        ...firstScene,
        files: [...firstScene.files, ...secondScene.files],
        fileCount: firstScene.fileCount + secondScene.fileCount,
        endTime: secondScene.endTime,
      };
      return next.filter((_, index) => index !== secondIndex);
    });
  }, [jpgBaseDirectory, mergeCandidates, rootDirectory, scenes, setBoundaryDecisions, setDismissedCandidates, setMergeDecisions, setSceneCorrections, setScenes]);

  const splitScene = useCallback((sceneIndex: number, offset: number) => {
    setScenes((previous) => {
      const result = splitPlannedFieldScene(previous, sceneIndex, offset, rootDirectory?.name ?? "local");
      if (!result) return previous;
      setBoundaryDecisions((items) => [
        ...items.filter((item) => item.boundaryIndex !== result.boundaryDecision.boundaryIndex),
        result.boundaryDecision,
      ].sort((first, second) => first.boundaryIndex - second.boundaryIndex));
      setSceneCorrections((items) => [...items, result.correction]);
      return result.scenes;
    });
  }, [rootDirectory, setBoundaryDecisions, setSceneCorrections, setScenes]);

  const renameScene = useCallback((sceneIndex: number, newName: string) => {
    const scene = scenes[sceneIndex];
    if (!scene || !newName.trim()) return false;
    setScenes((previous) => previous.map((item, index) => (
      index === sceneIndex ? { ...item, editedName: newName } : item
    )));
    if (newName !== scene.folderName) {
      setSceneCorrections((previous) => [
        ...previous,
        createRenameSceneCorrection(scene, newName, rootDirectory?.name ?? "local"),
      ]);
    }
    return true;
  }, [rootDirectory, scenes, setSceneCorrections, setScenes]);

  const approveScene = useCallback((sceneIndex: number) => {
    setScenes((previous) => previous.map((scene, index) => (
      index === sceneIndex ? { ...scene, approved: true } : scene
    )));
    const scene = scenes[sceneIndex];
    if (!scene || scene.approved) return;
    setSceneCorrections((previous) => [
      ...previous,
      createApproveSceneCorrection(scene, rootDirectory?.name ?? "local"),
    ]);
  }, [rootDirectory, scenes, setSceneCorrections, setScenes]);

  const approveAllScenes = useCallback(() => {
    const pending = scenes.filter((scene) => !scene.approved);
    setScenes((previous) => previous.map((scene) => ({ ...scene, approved: true })));
    setSceneCorrections((previous) => [
      ...previous,
      ...pending.map((scene) => createApproveSceneCorrection(scene, rootDirectory?.name ?? "local")),
    ]);
  }, [rootDirectory, scenes, setSceneCorrections, setScenes]);

  const dismissMergeCandidate = useCallback((candidateId: string) => {
    const candidate = mergeCandidates.find((item) => item.id === candidateId);
    if (candidate) {
      setMergeDecisions((previous) => [...previous, {
        candidateId: candidate.id,
        userAction: "keep_split",
        fromFolderName: candidate.fromFolderName,
        toFolderName: candidate.toFolderName,
        fromSceneType: candidate.fromSceneType,
        toSceneType: candidate.toSceneType,
        mergeScore: candidate.mergeScore,
        matchedSignals: candidate.matchedSignals,
        blockedSignals: candidate.blockedSignals,
        recommendedAction: candidate.recommendedAction,
      }]);
    }
    setDismissedCandidates((previous) => new Set([...previous, candidateId]));
  }, [mergeCandidates, setDismissedCandidates, setMergeDecisions]);

  const commitSceneName = useCallback((scene: FieldScene) => {
    if (scene.editedName === scene.folderName) return;
    setSceneCorrections((previous) => [
      ...previous,
      createRenameSceneCorrection(scene, scene.editedName, rootDirectory?.name ?? "local"),
    ]);
  }, [rootDirectory, setSceneCorrections]);

  const updateSceneName = useCallback((sceneIndex: number, value: string) => {
    setScenes((previous) => previous.map((scene, index) => (
      index === sceneIndex ? { ...scene, editedName: value } : scene
    )));
  }, [setScenes]);

  const updateSplitPosition = useCallback((sceneIndex: number, value: number) => {
    setSplitPositions((previous) => ({ ...previous, [sceneIndex]: value }));
  }, [setSplitPositions]);

  const startClassificationForChat = useCallback(async () => {
    if (!rootDirectory) return { ok: false, reason: "먼저 화면에서 폴더를 선택해주세요." };
    await startClassification();
    return { ok: true, sceneCount: scenesRef.current.length };
  }, [rootDirectory, startClassification]);

  const submitNaturalLanguageRequestForChat = useCallback(async (message: string) => {
    await submitNaturalLanguageRequest(message);
    return { ok: true, sceneCount: scenesRef.current.length };
  }, [submitNaturalLanguageRequest]);

  useEffect(() => {
    if (!actionsEnabled) return;
    const bundle = {
      renameScene,
      mergeScenes,
      splitScene,
      startAiClassification: startClassificationForChat,
      submitNlRequest: submitNaturalLanguageRequestForChat,
    };
    usePhotoClassificationActionsStore.getState().registerActions(bundle);
    return () => {
      if (usePhotoClassificationActionsStore.getState().actions === bundle) {
        usePhotoClassificationActionsStore.getState().registerActions(null);
      }
    };
  }, [actionsEnabled, mergeScenes, renameScene, splitScene, startClassificationForChat, submitNaturalLanguageRequestForChat]);

  return {
    approveAllScenes,
    approveScene,
    commitSceneName,
    dismissMergeCandidate,
    mergeScenes,
    splitScene,
    updateSceneName,
    updateSplitPosition,
  };
}
