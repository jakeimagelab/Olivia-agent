"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { runBrowserStudioClassification, runBrowserStudioOutput } from "@/lib/photo-classifier/browserStudioClassificationRunner";
import type {
  PersonGroup,
  LightingSensitivity,
  StudioGroup,
  StudioGroupSortMode,
  StudioPhotoFile,
  StudioStats,
  StudioSubMode,
} from "@/lib/photo-classifier/studioGrouping";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import type { PhotoClassificationProgress } from "./usePhotoClassificationProgress";

export function usePhotoSortingStudioActions({
  rootDirectory,
  subMode,
  groupSortMode,
  gapMinutes,
  lightingSensitivity,
  fileMode,
  files,
  conceptGroups,
  personGroups,
  rawCount,
  announceCompletion,
  cancelRef,
  updateProgress,
  setStep,
  setFiles,
  setConceptGroups,
  setPersonGroups,
  setRawCount,
  setCopyLog,
  setStats,
}: {
  rootDirectory: FileSystemDirectoryHandle | null;
  subMode: StudioSubMode;
  groupSortMode: StudioGroupSortMode;
  gapMinutes: number;
  lightingSensitivity: LightingSensitivity;
  fileMode: "copy" | "move";
  files: StudioPhotoFile[];
  conceptGroups: StudioGroup[];
  personGroups: PersonGroup[];
  rawCount: number;
  announceCompletion: boolean;
  cancelRef: MutableRefObject<boolean>;
  updateProgress: (next: PhotoClassificationProgress) => void;
  setStep: Dispatch<SetStateAction<number>>;
  setFiles: Dispatch<SetStateAction<StudioPhotoFile[]>>;
  setConceptGroups: Dispatch<SetStateAction<StudioGroup[]>>;
  setPersonGroups: Dispatch<SetStateAction<PersonGroup[]>>;
  setRawCount: Dispatch<SetStateAction<number>>;
  setCopyLog: Dispatch<SetStateAction<string[]>>;
  setStats: Dispatch<SetStateAction<StudioStats | null>>;
}) {
  const classifyStudio = useCallback(async () => {
    if (!rootDirectory) return;
    setStep(1);
    cancelRef.current = false;
    updateProgress({ cur: 0, total: 0, msg: "폴더 스캔 중..." });
    try {
      const result = await runBrowserStudioClassification({
        rootDirectory,
        subMode,
        groupSortMode,
        gapMinutes,
        lightingSensitivity,
        onProgress: updateProgress,
        onFilesScanned: (nextFiles, nextRawCount) => {
          setRawCount(nextRawCount);
          setFiles(nextFiles);
          setStep(2);
        },
        onFilesChange: setFiles,
      });
      setFiles(result.files);
      setConceptGroups(result.conceptGroups);
      setPersonGroups(result.personGroups);
      setStep(3);
      if (announceCompletion) {
        const summary = `사진 분류 완료\n\n총 사진 ${result.total}장`;
        useOliviaConversationStore.getState().appendMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: summary,
          blocks: [{ type: "text", text: summary }],
          createdAt: new Date().toISOString(),
          status: "complete",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCopyLog((previous) => [...previous, `❌ 오류: 파일 분류를 진행하지 못했습니다 — ${message}`]);
      setStep(0);
    }
  }, [announceCompletion, cancelRef, gapMinutes, groupSortMode, lightingSensitivity, rootDirectory, setConceptGroups, setCopyLog, setFiles, setPersonGroups, setRawCount, setStep, subMode, updateProgress]);

  const organizeStudioFiles = useCallback(async () => {
    if (!rootDirectory || (subMode === "group" ? personGroups.length === 0 : conceptGroups.length === 0)) return;
    setStep(5);
    cancelRef.current = false;
    try {
      const stats = await runBrowserStudioOutput({
        rootDirectory,
        subMode,
        personGroups,
        conceptGroups,
        totalJpg: files.length,
        totalRaw: rawCount,
        fileMode,
        isCancelled: () => cancelRef.current,
        onProgress: updateProgress,
        onLog: setCopyLog,
      });
      setStats(stats);
      setStep(6);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCopyLog((previous) => [...previous, `❌ 오류: 파일 정리를 완료하지 못했습니다 — ${message}`]);
      setStep(4);
    }
  }, [cancelRef, conceptGroups, fileMode, files.length, personGroups, rawCount, rootDirectory, setCopyLog, setStats, setStep, subMode, updateProgress]);

  return { classifyStudio, organizeStudioFiles };
}
