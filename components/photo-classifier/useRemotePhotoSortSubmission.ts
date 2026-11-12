"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRemotePhotoSortJob,
  type RemotePhotoSortJob,
  type RemotePhotoSortPayload,
} from "@/lib/photo-classifier/remotePhotoSort";
import {
  buildRemotePhotoSortPayload,
  resolveRemotePhotoSortStart,
} from "@/lib/photo-classifier/remotePhotoSortRequest";
import type { RemoteWorkFolderCheckState } from "./useRemoteWorkFolderCheck";

export function useRemotePhotoSortSubmission({
  sourceFolder,
  shootingMode,
  department,
  studioGapMinutes,
  fieldGapMinutes,
  classificationUiMode,
  fastAnalyzeMode,
  departmentLogicEnabled,
  aiNamingEnabled,
  qualityAnalysisEnabled,
  profileClassificationEnabled,
  departmentResolved,
  workerOffline,
  workFolderState,
  workFolderReady,
  jobActive,
  onDepartmentRequired,
  onJobCreated,
}: {
  sourceFolder: string | null | undefined;
  shootingMode: RemotePhotoSortPayload["shooting_mode"];
  department: string;
  studioGapMinutes: number;
  fieldGapMinutes: number;
  classificationUiMode: RemotePhotoSortPayload["classification_ui_mode"];
  fastAnalyzeMode: boolean;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  departmentResolved: boolean;
  workerOffline: boolean;
  workFolderState: RemoteWorkFolderCheckState;
  workFolderReady: boolean;
  jobActive: boolean;
  onDepartmentRequired: () => void;
  onJobCreated: (job: RemotePhotoSortJob) => void;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    const controller = abortRef.current;
    abortRef.current = null;
    controller?.abort();
  }, []);

  const clearError = useCallback(() => setError(""), []);
  const reportError = useCallback((value: unknown, fallback: string) => {
    setError(value instanceof Error ? value.message : fallback);
  }, []);

  const submit = useCallback(async () => {
    const normalizedSourceFolder = sourceFolder ?? "";
    const startDecision = resolveRemotePhotoSortStart({
      sourceFolder: normalizedSourceFolder,
      shootingMode,
      departmentResolved,
      workerOffline,
      workFolderStatus: workFolderState.status,
      workFolderMessage: workFolderState.status === "error"
        ? workFolderState.message
        : undefined,
      workFolderReady,
      jobActive,
    });
    if (!startDecision.allowed) {
      if (startDecision.message) setError(startDecision.message);
      if (startDecision.openDepartmentPicker) onDepartmentRequired();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setSubmitting(true);

    try {
      const job = await createRemotePhotoSortJob(buildRemotePhotoSortPayload({
        sourceFolder: normalizedSourceFolder,
        shootingMode,
        department,
        studioGapMinutes,
        fieldGapMinutes,
        classificationUiMode,
        fastAnalyzeMode,
        departmentLogicEnabled,
        aiNamingEnabled,
        qualityAnalysisEnabled,
        profileClassificationEnabled,
      }), {
        signal: controller.signal,
      });
      onJobCreated(job);
    } catch (caughtError) {
      if (controller.signal.aborted) return;
      reportError(caughtError, "Mac Studio에 작업 요청을 보내지 못했습니다.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setSubmitting(false);
      }
    }
  }, [
    aiNamingEnabled,
    classificationUiMode,
    department,
    departmentLogicEnabled,
    departmentResolved,
    fastAnalyzeMode,
    fieldGapMinutes,
    jobActive,
    onDepartmentRequired,
    onJobCreated,
    profileClassificationEnabled,
    qualityAnalysisEnabled,
    reportError,
    shootingMode,
    sourceFolder,
    studioGapMinutes,
    workFolderReady,
    workFolderState,
    workerOffline,
  ]);

  return {
    active: submitting || jobActive,
    clearError,
    error,
    reportError,
    submit,
    submitting,
  };
}
