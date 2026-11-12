"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { resolveRemoteJobResult, useRemoteJobPoller } from "@/components/person-select/admin/hooks/useRemoteJobPoller";
import { usePersonSelectUploadManager } from "@/components/person-select/upload/PersonSelectUploadManager";
import { readApiResponse } from "@/lib/http/apiResponse";
import {
  collectLocalPersonSelectFileList,
  collectLocalPersonSelectFolder,
  type LocalPersonSelectScan,
  type PersonSelectImportLayout,
} from "@/lib/person-select/localImport";

export type PersonSelectSourceMode = "local" | "remote";
export type PersonSelectUploadKind = "original" | "delivery";

export function usePersonSelectImportController({
  eventId,
  projectTitle,
  layout,
  isShared,
  load,
  onOriginalImportComplete,
  setMessage,
}: {
  eventId: string;
  projectTitle: string;
  layout: PersonSelectImportLayout;
  isShared: boolean;
  load: () => Promise<void>;
  onOriginalImportComplete: () => void;
  setMessage: (message: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [path, setPath] = useState("");
  const [sourceMode, setSourceMode] = useState<PersonSelectSourceMode>("local");
  const [uploadKind, setUploadKind] = useState<PersonSelectUploadKind>("original");
  const [localFolderName, setLocalFolderName] = useState("");
  const [localScan, setLocalScan] = useState<LocalPersonSelectScan | null>(null);
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [deliveryJobId, setDeliveryJobId] = useState("");
  const [deliveryResult, setDeliveryResult] = useState<Record<string, unknown> | null>(null);
  const [deliveryAssignments, setDeliveryAssignments] = useState<Record<string, string>>({});
  const localInputRef = useRef<HTMLInputElement>(null);
  const handledUploadJobRef = useRef<string | null>(null);
  const uploadManager = usePersonSelectUploadManager();

  useRemoteJobPoller({
    jobId,
    label: "사진 가져오기 상태",
    onTerminal: async (job) => {
      setResult(resolveRemoteJobResult(job));
      setJobId("");
      await load();
      if (job.status === "COMPLETED") onOriginalImportComplete();
    },
  });

  useRemoteJobPoller({
    jobId: deliveryJobId,
    label: "보정본 가져오기 상태",
    onTerminal: async (job) => {
      const nextResult = resolveRemoteJobResult(job, "보정본 가져오기에 실패했습니다.");
      setDeliveryResult(nextResult);
      if (job.status !== "COMPLETED") {
        setMessage(`보정본 가져오기 실패: ${String(nextResult.error ?? job.error ?? "작업 결과를 확인해 주세요.")}`);
      }
      setDeliveryJobId("");
      await load();
    },
  });

  const eventUploadJob = uploadManager.jobs.find((job) => job.event_id === eventId) ?? null;
  const localBusy = Boolean(eventUploadJob && (eventUploadJob.status === "queued" || eventUploadJob.status === "uploading"));
  const localProgress = eventUploadJob
    ? { current: eventUploadJob.success_count, total: eventUploadJob.total_count, fileName: "" }
    : { current: 0, total: 0, fileName: "" };

  useEffect(() => {
    if (!eventUploadJob || handledUploadJobRef.current === eventUploadJob.id || !["completed", "partial_failed", "failed"].includes(eventUploadJob.status)) return;
    handledUploadJobRef.current = eventUploadJob.id;
    setResult({
      photoCount: eventUploadJob.total_count,
      importedCount: eventUploadJob.success_count,
      failedCount: eventUploadJob.failed_count,
      message: eventUploadJob.status === "completed"
        ? "사진 업로드가 완료됐어요."
        : eventUploadJob.status === "partial_failed"
          ? "일부 사진을 올리지 못했어요."
          : "사진 업로드에 실패했어요.",
    });
    void load();
    if (eventUploadJob.status === "completed") onOriginalImportComplete();
  }, [eventUploadJob, load, onOriginalImportComplete]);

  const selectLocalFolder = useCallback(async () => {
    const showDirectoryPicker = (window as Window & {
      showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    if (!showDirectoryPicker) {
      localInputRef.current?.click();
      return;
    }
    try {
      // 폴더 선택기는 사용자 클릭의 첫 await에서 바로 열어야 브라우저가 차단하지 않는다.
      const directory = await showDirectoryPicker({ mode: "read" });
      setMessage("");
      const selected = await collectLocalPersonSelectFolder(directory, layout);
      setLocalFolderName(selected.folderName);
      setLocalScan(selected.scan);
      setResult(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setMessage(cause instanceof Error ? cause.message : "로컬 폴더를 읽지 못했습니다.");
    }
  }, [layout, setMessage]);

  const selectLocalFileList = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    try {
      const selected = collectLocalPersonSelectFileList(files, layout);
      setMessage("");
      setLocalFolderName(selected.folderName);
      setLocalScan(selected.scan);
      setResult(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "로컬 폴더를 읽지 못했습니다.");
    } finally {
      if (localInputRef.current) localInputRef.current.value = "";
    }
  }, [layout, setMessage]);

  const startRemoteImport = useCallback(async () => {
    if (!path) {
      setMessage(layout === "school" ? "학교전달 폴더를 선택해 주세요." : "촬영 폴더를 선택해 주세요.");
      return;
    }
    setMessage("");
    setResult(null);
    try {
      const payload = layout === "school"
        ? {
            event_id: eventId,
            source_relative_path: path,
            mappings: [
              { folder: "선생님프로필", category: "profile", owner: "person" },
              { folder: "담임선생님", category: "homeroom", owner: "group" },
            ],
          }
        : { event_id: eventId, source_relative_path: path, layout };
      const response = await fetch("/api/remote-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PERSON_SELECT_IMPORT", payload }),
      });
      const body = await readApiResponse<{ job?: { id?: string }; id?: string }>(response, "사진 가져오기");
      setJobId(body.job?.id || body.id || "");
      setResult({ message: "사진 가져오기를 시작했어요." });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "사진 가져오기를 시작하지 못했습니다.");
    }
  }, [eventId, layout, path, setMessage]);

  const startLocalImport = useCallback(async () => {
    if (!localScan?.files.length) {
      setMessage("JPG가 들어 있는 로컬 폴더를 선택해 주세요.");
      return;
    }
    setMessage("");
    setResult(null);
    try {
      if (eventUploadJob && !["completed", "canceled"].includes(eventUploadJob.status) && (eventUploadJob.needs_file_reselection || eventUploadJob.failed_count > 0)) {
        await uploadManager.reattachLocalFiles(eventUploadJob.id, localScan);
        setResult({ message: "완료된 사진은 건너뛰고 남은 사진을 이어서 올립니다." });
      } else {
        await uploadManager.startLocalUpload({
          eventId,
          projectTitle,
          layout,
          sourceName: localFolderName || "로컬 폴더",
          scan: localScan,
        });
        setResult({ message: "업로드를 시작했어요. 다른 OS 앱으로 이동해도 이 탭이 열려 있는 동안 계속됩니다." });
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "로컬 사진 가져오기에 실패했습니다.");
    }
  }, [eventId, eventUploadJob, layout, localFolderName, localScan, projectTitle, setMessage, uploadManager]);

  const startImport = useCallback(() => sourceMode === "local" ? startLocalImport() : startRemoteImport(), [sourceMode, startLocalImport, startRemoteImport]);

  const startDeliveryImport = useCallback(async () => {
    if (!path) {
      setMessage("Mac Studio의 보정본 폴더를 선택해 주세요.");
      return;
    }
    setMessage("");
    setDeliveryResult(null);
    try {
      const response = await fetch(`/api/person-select/${eventId}/deliveries/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: path }),
      });
      const body = await readApiResponse<{ job?: { id?: string } }>(response, "보정본 가져오기");
      setDeliveryJobId(body.job?.id ?? "");
      setDeliveryResult({ message: "보정본 원본과 미리보기를 안전하게 올리고 있어요." });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "보정본 가져오기를 시작하지 못했습니다.");
    }
  }, [eventId, path, setMessage]);

  const assignDelivery = useCallback(async (deliveryId: string) => {
    const value = deliveryAssignments[deliveryId]?.trim() ?? "";
    if (!value) {
      setMessage(isShared ? "연결할 폴더 이름을 입력해 주세요." : "연결할 고객을 선택해 주세요.");
      return;
    }
    try {
      const response = await fetch(`/api/person-select/${eventId}/deliveries/${deliveryId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isShared ? { groupLabel: value } : { personId: value }),
      });
      await readApiResponse(response, "보정본 연결");
      setDeliveryAssignments((current) => {
        const next = { ...current };
        delete next[deliveryId];
        return next;
      });
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "보정본 연결을 저장하지 못했습니다.");
    }
  }, [deliveryAssignments, eventId, isShared, load, setMessage]);

  const changeDeliveryOwner = useCallback(async (action: "reopen" | "extend", personId?: string) => {
    try {
      const endpoint = action === "reopen" ? "state" : "retention";
      const response = await fetch(`/api/person-select/${eventId}/deliveries/${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "reopen" ? { action: "reopen", personId } : { personId }),
      });
      await readApiResponse(response, action === "reopen" ? "보정본 다시 열기" : "보관 기간 연장");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "보정본 상태를 바꾸지 못했습니다.");
    }
  }, [eventId, load, setMessage]);

  const resumeLocalImport = useCallback(async () => {
    if (!eventUploadJob) return;
    try {
      await uploadManager.resume(eventUploadJob.id);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "업로드를 계속하지 못했습니다.");
    }
  }, [eventUploadJob, setMessage, uploadManager]);

  const clearLocalSelection = useCallback(() => {
    setLocalFolderName("");
    setLocalScan(null);
  }, []);

  const selectRemotePath = useCallback((nextPath: string) => {
    setPath(nextPath);
    setPickerOpen(false);
  }, []);

  const updateDeliveryAssignment = useCallback((deliveryId: string, value: string) => {
    setDeliveryAssignments((current) => ({ ...current, [deliveryId]: value }));
  }, []);

  return {
    pickerOpen,
    setPickerOpen,
    path,
    setPath,
    sourceMode,
    setSourceMode,
    uploadKind,
    setUploadKind,
    localFolderName,
    localScan,
    localInputRef,
    jobId,
    result,
    deliveryJobId,
    deliveryResult,
    deliveryAssignments,
    eventUploadJob,
    localBusy,
    localProgress,
    selectLocalFolder,
    selectLocalFileList,
    startImport,
    startDeliveryImport,
    assignDelivery,
    changeDeliveryOwner,
    resumeLocalImport,
    clearLocalSelection,
    selectRemotePath,
    updateDeliveryAssignment,
  };
}
