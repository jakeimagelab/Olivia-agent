"use client";

import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import {
  manualPhotoDepartmentResolution,
  type PhotoDepartmentResolution,
} from "@/lib/photo-classifier/departmentResolver";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import type { StudioOptions, StudioSubMode } from "@/lib/photo-classifier/studioGrouping";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { usePhotoClassificationHandoffStore } from "@/lib/store/usePhotoClassificationHandoffStore";
import type { PhotoShootingMode } from "./PhotoShootingModeControl";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export function usePhotoSortingHandoff({
  enabled,
  clientId,
  workflowRunId,
  rootDirectory,
  photoMode,
  departmentContextKeyRef,
  setCurrentLocalFolder,
  setRootDirectory,
  setPhotoMode,
  setDepartment,
  setDepartmentResolution,
  setDepartmentPickerOpen,
  setGapMinutes,
  setFastAnalyzeMode,
  setDepartmentLogicEnabled,
  setAiNamingEnabled,
  setQualityAnalysisEnabled,
  setProfileClassificationEnabled,
  setStudioOptions,
  setStudioSubMode,
  runFieldClassification,
  runStudioClassification,
}: {
  enabled: boolean;
  clientId: string;
  workflowRunId: string;
  rootDirectory: FileSystemDirectoryHandle | null;
  photoMode: PhotoShootingMode;
  departmentContextKeyRef: MutableRefObject<string>;
  setCurrentLocalFolder: (folder: FileSystemDirectoryHandle | null) => void;
  setRootDirectory: StateSetter<FileSystemDirectoryHandle | null>;
  setPhotoMode: StateSetter<PhotoShootingMode>;
  setDepartment: StateSetter<MedicalDepartment>;
  setDepartmentResolution: (resolution: PhotoDepartmentResolution) => void;
  setDepartmentPickerOpen: StateSetter<boolean>;
  setGapMinutes: StateSetter<number>;
  setFastAnalyzeMode: StateSetter<boolean>;
  setDepartmentLogicEnabled: StateSetter<boolean>;
  setAiNamingEnabled: StateSetter<boolean>;
  setQualityAnalysisEnabled: StateSetter<boolean>;
  setProfileClassificationEnabled: StateSetter<boolean>;
  setStudioOptions: StateSetter<StudioOptions>;
  setStudioSubMode: StateSetter<StudioSubMode>;
  runFieldClassification: () => Promise<void>;
  runStudioClassification: () => Promise<void>;
}) {
  const handoffPendingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const handoff = usePhotoClassificationHandoffStore.getState().consume();
    if (!handoff?.rootDir) return;

    setPhotoMode(handoff.photoMode);
    departmentContextKeyRef.current = `${clientId}:${workflowRunId}:${handoff.rootDir.name}`;
    setCurrentLocalFolder(handoff.rootDir);
    setRootDirectory(handoff.rootDir);

    if (handoff.photoMode === "field") {
      if (handoff.department) {
        setDepartment(handoff.department);
        setDepartmentResolution(
          handoff.departmentResolution ?? manualPhotoDepartmentResolution(handoff.department),
        );
        setDepartmentPickerOpen(false);
      }
      if (handoff.gapMinutes != null) setGapMinutes(handoff.gapMinutes);
      if (handoff.fastAnalyzeMode != null) setFastAnalyzeMode(handoff.fastAnalyzeMode);
      if (handoff.departmentLogicEnabled != null) setDepartmentLogicEnabled(handoff.departmentLogicEnabled);
      if (handoff.aiNamingEnabled != null) setAiNamingEnabled(handoff.aiNamingEnabled);
      if (handoff.qualityAnalysisEnabled != null) setQualityAnalysisEnabled(handoff.qualityAnalysisEnabled);
      if (handoff.profileClassificationEnabled != null) {
        setProfileClassificationEnabled(handoff.profileClassificationEnabled);
      }
    } else {
      if (handoff.lightingSensitivity) {
        setStudioOptions((current) => ({
          ...current,
          lightingSensitivity: handoff.lightingSensitivity!,
        }));
      }
      if (handoff.studioSubMode) setStudioSubMode(handoff.studioSubMode);
    }

    handoffPendingRef.current = true;
    // The handoff store is intentionally consumed once when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!handoffPendingRef.current || !rootDirectory) return;
    handoffPendingRef.current = false;

    const run = photoMode === "field"
      ? runFieldClassification()
      : runStudioClassification();
    run.catch((error) => {
      const message = error instanceof Error ? error.message : "사진 분류 중 오류가 발생했습니다.";
      useOliviaConversationStore.getState().appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `사진 분류 중 오류가 발생했습니다. (${message})`,
        blocks: [{ type: "text", text: `사진 분류 중 오류가 발생했습니다. (${message})` }],
        createdAt: new Date().toISOString(),
        status: "complete",
      });
    });
  }, [photoMode, rootDirectory, runFieldClassification, runStudioClassification]);
}
