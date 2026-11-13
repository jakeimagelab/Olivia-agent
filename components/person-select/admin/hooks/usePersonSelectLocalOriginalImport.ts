"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePersonSelectUploadManager } from "@/components/person-select/upload/PersonSelectUploadManager";
import {
  collectLocalPersonSelectFileList,
  collectLocalPersonSelectFolder,
  type LocalPersonSelectScan,
  type PersonSelectImportLayout,
} from "@/lib/person-select/localImport";

export function usePersonSelectLocalOriginalImport({
  eventId,
  projectTitle,
  layout,
  load,
  onComplete,
  setMessage,
  setResult,
}: {
  eventId: string;
  projectTitle: string;
  layout: PersonSelectImportLayout;
  load: () => Promise<void>;
  onComplete: () => void;
  setMessage: (message: string) => void;
  setResult: (result: Record<string, unknown> | null) => void;
}) {
  const [localFolderName, setLocalFolderName] = useState("");
  const [localScan, setLocalScan] = useState<LocalPersonSelectScan | null>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const handledUploadJobRef = useRef<string | null>(null);
  const uploadManager = usePersonSelectUploadManager();

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
    if (eventUploadJob.status === "completed") onComplete();
  }, [eventUploadJob, load, onComplete, setResult]);

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
  }, [layout, setMessage, setResult]);

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
  }, [layout, setMessage, setResult]);

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
  }, [eventId, eventUploadJob, layout, localFolderName, localScan, projectTitle, setMessage, setResult, uploadManager]);

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

  return {
    localFolderName,
    localScan,
    localInputRef,
    eventUploadJob,
    localBusy,
    localProgress,
    selectLocalFolder,
    selectLocalFileList,
    startLocalImport,
    resumeLocalImport,
    clearLocalSelection,
  };
}
