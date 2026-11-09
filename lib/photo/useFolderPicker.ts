"use client";

import { useCallback, useEffect, useState } from "react";

type FolderPickerMode = "read" | "readwrite";
type FolderPickerOptions = { startIn?: FileSystemDirectoryHandle };
type DirectoryPicker = (options?: { mode?: FolderPickerMode; startIn?: FileSystemDirectoryHandle }) => Promise<FileSystemDirectoryHandle>;

function directoryPicker(): DirectoryPicker | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
}

export function usePhotoFolderPicker(): {
  supported: boolean;
  pick: (mode: FolderPickerMode, options?: FolderPickerOptions) => Promise<FileSystemDirectoryHandle | null>;
  error: string;
} {
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSupported(Boolean(directoryPicker()));
  }, []);

  const pick = useCallback(async (mode: FolderPickerMode, options: FolderPickerOptions = {}) => {
    const picker = directoryPicker();
    if (!picker) {
      setError("Chrome 또는 Edge에서 작업 폴더를 선택할 수 있습니다.");
      return null;
    }

    setError("");
    try {
      // File System Access API는 사용자 제스처가 유지되는 첫 번째 await에서 호출해야 한다.
      try {
        return await picker({ mode, ...options });
      } catch (cause) {
        const startInUnsupported = cause instanceof TypeError
          || (cause instanceof DOMException && cause.name === "NotSupportedError");
        if (!options.startIn || !startInUnsupported) throw cause;
        return await picker({ mode });
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return null;
      setError(cause instanceof Error ? cause.message : "폴더를 선택하지 못했습니다.");
      return null;
    }
  }, []);

  return { supported, pick, error };
}
