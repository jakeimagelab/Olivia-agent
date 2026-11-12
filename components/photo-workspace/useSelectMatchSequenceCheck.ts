"use client";

import { useCallback, useState } from "react";

import { SELECT_MATCH_JPG_EXTENSIONS } from "@/lib/selectMatch/folderScanner";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";
import {
  checkFileSequence,
  type SequenceCheckResult,
} from "@/lib/selectMatch/workspaceHelpers";

type SequenceCheckStep = "idle" | "scanning" | "result";

export function formatMissingSequenceRange(range: { start: number; end: number }): string {
  return range.start === range.end
    ? `${range.start}`
    : `${range.start}~${range.end} (${range.end - range.start + 1}개)`;
}

export function useSelectMatchSequenceCheck() {
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [step, setStep] = useState<SequenceCheckStep>("idle");
  const [result, setResult] = useState<SequenceCheckResult | null>(null);

  const pickFolder = useCallback(async () => {
    try {
      const directory = await (window as typeof window & {
        showDirectoryPicker(options: { mode: "read" }): Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker({ mode: "read" });
      setRootDir(directory);
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") alert("폴더 선택 실패");
    }
  }, []);

  const runCheck = useCallback(async () => {
    if (!rootDir) return;
    setStep("scanning");
    const names: string[] = [];
    const scanDirectory = async (directory: FileSystemDirectoryHandle, depth = 0): Promise<void> => {
      if (depth > 8) return;
      const entries = (directory as FileSystemDirectoryHandle & {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      }).entries();
      for await (const [name, handle] of entries) {
        if (handle.kind === "directory") {
          await scanDirectory(handle as FileSystemDirectoryHandle, depth + 1);
          continue;
        }
        const extension = name.split(".").pop()?.toLowerCase() ?? "";
        if (!SELECT_MATCH_RAW_EXTENSIONS.has(extension) && !SELECT_MATCH_JPG_EXTENSIONS.has(extension)) continue;
        names.push(name);
      }
    };
    await scanDirectory(rootDir);
    setResult(checkFileSequence(names));
    setStep("result");
  }, [rootDir]);

  const reset = useCallback(() => {
    setStep("idle");
    setResult(null);
    setRootDir(null);
  }, []);

  return {
    rootDir,
    step,
    result,
    pickFolder,
    runCheck,
    reset,
  };
}
