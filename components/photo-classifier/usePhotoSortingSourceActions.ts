"use client";

import { useCallback, type MutableRefObject, type MouseEvent, type PointerEvent } from "react";
import type { PhotoDepartmentResolution } from "@/lib/photo-classifier/departmentResolver";
import type { ExecutionMode } from "@/lib/photo-classifier/photoSource";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";

export function photoSortingFolderActivation(
  executionMode: ExecutionMode,
  event: { kind: "pointer"; button: number } | { kind: "click"; detail: number },
) {
  if (executionMode === "REMOTE_WORKER") return event.kind === "click" ? "remote" : null;
  if (event.kind === "pointer") return event.button === 0 ? "local" : null;
  return event.detail === 0 ? "local" : null;
}

export function usePhotoSortingSourceActions({
  executionMode,
  pickPhotoFolder,
  closePhotoSourcePicker,
  openRemotePhotoSourcePicker,
  selectRemotePhotoSource,
  departmentContextKeyRef,
  setPhotoDepartmentResolution,
  setRootDirectory,
  setDepartmentContextError,
  setDepartmentPickerOpen,
  remoteJobActive,
  clearRemoteJob,
  clearRemotePhotoSortError,
  setDirectoryError,
}: {
  executionMode: ExecutionMode;
  pickPhotoFolder: (mode: "readwrite") => Promise<FileSystemDirectoryHandle | null>;
  closePhotoSourcePicker: () => void;
  openRemotePhotoSourcePicker: () => void;
  selectRemotePhotoSource: (selection: RemoteNasSelection) => void;
  departmentContextKeyRef: MutableRefObject<string>;
  setPhotoDepartmentResolution: (resolution: PhotoDepartmentResolution) => void;
  setRootDirectory: (handle: FileSystemDirectoryHandle) => void;
  setDepartmentContextError: (message: string) => void;
  setDepartmentPickerOpen: (open: boolean) => void;
  remoteJobActive: boolean;
  clearRemoteJob: () => void;
  clearRemotePhotoSortError: () => void;
  setDirectoryError: (message: string) => void;
}) {
  const pickDirectory = useCallback(async () => {
    setDirectoryError("");
    const handle = await pickPhotoFolder("readwrite");
    if (!handle) return;
    departmentContextKeyRef.current = "";
    setPhotoDepartmentResolution({ status: "unknown", evidence: [] });
    setRootDirectory(handle);
    closePhotoSourcePicker();
  }, [
    closePhotoSourcePicker,
    departmentContextKeyRef,
    pickPhotoFolder,
    setDirectoryError,
    setPhotoDepartmentResolution,
    setRootDirectory,
  ]);

  const openPhotoSourcePicker = useCallback(() => {
    setDirectoryError("");
    openRemotePhotoSourcePicker();
  }, [openRemotePhotoSourcePicker, setDirectoryError]);

  const selectRemoteFolder = useCallback((selection: RemoteNasSelection) => {
    selectRemotePhotoSource(selection);
    departmentContextKeyRef.current = "";
    setPhotoDepartmentResolution({ status: "unknown", evidence: [] });
    setDepartmentContextError("");
    setDepartmentPickerOpen(false);
    if (!remoteJobActive) clearRemoteJob();
    clearRemotePhotoSortError();
    setDirectoryError("");
  }, [
    clearRemoteJob,
    clearRemotePhotoSortError,
    departmentContextKeyRef,
    remoteJobActive,
    selectRemotePhotoSource,
    setDepartmentContextError,
    setDepartmentPickerOpen,
    setDirectoryError,
    setPhotoDepartmentResolution,
  ]);

  const handleFolderPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (photoSortingFolderActivation(executionMode, { kind: "pointer", button: event.button }) === "local") {
      void pickDirectory();
    }
  }, [executionMode, pickDirectory]);

  const handleFolderClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const activation = photoSortingFolderActivation(executionMode, { kind: "click", detail: event.detail });
    if (activation === "remote") openPhotoSourcePicker();
    else if (activation === "local") void pickDirectory();
  }, [executionMode, openPhotoSourcePicker, pickDirectory]);

  return {
    handleFolderClick,
    handleFolderPointerDown,
    openPhotoSourcePicker,
    pickDirectory,
    selectRemoteFolder,
  };
}
