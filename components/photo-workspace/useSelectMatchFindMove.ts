"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  remoteRawMatchUnavailableReason,
  runRemoteRawMatchCopy,
} from "@/lib/selectMatch/remoteRawMatch";
import { prepareScreenshotForOcr } from "@/lib/selectMatch/browserOcr";
import { parseFileNameQueries } from "@/lib/selectMatch/workspaceHelpers";

export type SelectMatchFindMoveStep = "idle" | "scanning" | "result" | "moving" | "done";

export type SelectMatchFindMoveItem = {
  query: string;
  name: string;
  handle: FileSystemFileHandle;
  parentDir: FileSystemDirectoryHandle;
  relativePath: string;
};

export function useSelectMatchFindMove({
  workerOnline,
}: {
  workerOnline: boolean | null;
}) {
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [text, setText] = useState("");
  const [folderName, setFolderName] = useState("선택");
  const [step, setStep] = useState<SelectMatchFindMoveStep>("idle");
  const [matches, setMatches] = useState<SelectMatchFindMoveItem[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [progress, setProgress] = useState({ cur: 0, total: 0 });
  const [movedCount, setMovedCount] = useState(0);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [workerRootPath, setWorkerRootPath] = useState("");
  const [moveError, setMoveError] = useState("");
  const ocrFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rootDir) setWorkerRootPath(`/Volumes/${rootDir.name}`);
  }, [rootDir]);

  const pickFolder = useCallback(async () => {
    try {
      const directory = await (window as typeof window & {
        showDirectoryPicker(options: { mode: "readwrite" }): Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker({ mode: "readwrite" });
      setRootDir(directory);
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") alert("폴더 선택 실패");
    }
  }, []);

  const extractNamesFromScreenshot = useCallback(async (file: File | null) => {
    if (!file || ocrLoading) return;
    setOcrLoading(true);
    setOcrMessage(null);
    try {
      const imageBase64 = await prepareScreenshotForOcr(file);
      const response = await fetch("/api/select-match/ocr-filenames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        oneLine?: string;
        filenames?: unknown[];
      } | null;
      if (!response.ok || !data?.ok || typeof data.oneLine !== "string") {
        throw new Error(data?.error || "파일명 추출에 실패했습니다.");
      }
      setText(data.oneLine);
      setOcrMessage({ text: `파일명 ${data.filenames?.length ?? 0}개를 한 줄로 정리했습니다.`, ok: true });
    } catch (error) {
      setOcrMessage({ text: error instanceof Error ? error.message : "파일명 추출에 실패했습니다.", ok: false });
    } finally {
      setOcrLoading(false);
      if (ocrFileRef.current) ocrFileRef.current.value = "";
    }
  }, [ocrLoading]);

  const runFindByName = useCallback(async () => {
    if (!rootDir) return;
    const queries = parseFileNameQueries(text);
    if (!queries.length) {
      alert("파일명을 입력해주세요.");
      return;
    }
    setStep("scanning");

    type IndexedFile = Omit<SelectMatchFindMoveItem, "query"> & { extLower: string };
    const index = new Map<string, IndexedFile[]>();
    const scanDirectory = async (
      directory: FileSystemDirectoryHandle,
      depth = 0,
      relativeDirectory = "",
    ): Promise<void> => {
      if (depth > 5) return;
      const entries = (directory as FileSystemDirectoryHandle & {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      }).entries();
      for await (const [name, handle] of entries) {
        if (name === folderName) continue;
        if (handle.kind === "directory") {
          await scanDirectory(
            handle as FileSystemDirectoryHandle,
            depth + 1,
            relativeDirectory ? `${relativeDirectory}/${name}` : name,
          );
          continue;
        }
        const match = name.match(/^(.+)\.([A-Za-z0-9]{2,5})$/);
        if (!match) continue;
        const basenameLower = match[1].toLowerCase();
        const list = index.get(basenameLower) ?? [];
        list.push({
          name,
          handle: handle as FileSystemFileHandle,
          extLower: match[2].toLowerCase(),
          parentDir: directory,
          relativePath: relativeDirectory ? `${relativeDirectory}/${name}` : name,
        });
        index.set(basenameLower, list);
      }
    };
    await scanDirectory(rootDir);

    const found: SelectMatchFindMoveItem[] = [];
    const notFound: string[] = [];
    for (const query of queries) {
      const candidates = index.get(query.basenameLower) ?? [];
      const picked = query.extLower
        ? candidates.filter((candidate) => candidate.extLower === query.extLower)
        : candidates;
      if (!picked.length) {
        notFound.push(query.raw);
        continue;
      }
      for (const candidate of picked) found.push({ query: query.raw, ...candidate });
    }
    const uniqueMatches = Array.from(new Map(
      found.map((match) => [match.relativePath.normalize("NFC"), match]),
    ).values());
    setMatches(uniqueMatches);
    setMissing(notFound);
    setStep("result");
  }, [folderName, rootDir, text]);

  const runMoveMatched = useCallback(async () => {
    if (!rootDir || !matches.length) return;
    const unavailableReason = remoteRawMatchUnavailableReason(workerOnline);
    if (unavailableReason) {
      setMoveError(unavailableReason);
      return;
    }
    if (!workerRootPath.trim()) {
      setMoveError("Mac Studio에서 보이는 기준 폴더 경로를 입력해 주세요.");
      return;
    }
    setStep("moving");
    setMoveError("");
    try {
      const items = await Promise.all(matches.map(async (match) => ({
        rawPath: match.relativePath,
        destDir: folderName,
        rawAction: "move" as const,
        rawExpectedSize: (await match.handle.getFile()).size,
        rawExpectedCaptureTimeMs: null,
      })));
      const result = await runRemoteRawMatchCopy({
        rawRootPath: workerRootPath.trim(),
        items,
        logRows: [],
      }, {
        workerOnline,
        onJob: (job) => {
          if (job.progress) setProgress({ cur: job.progress.current, total: job.progress.total });
        },
      });
      setMovedCount(result.rawMoved);
      setStep("done");
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : "Mac Studio 파일 이동 작업에 실패했습니다.");
      setStep("result");
    }
  }, [folderName, matches, rootDir, workerOnline, workerRootPath]);

  const reset = useCallback(() => {
    setStep("idle");
    setMatches([]);
    setMissing([]);
    setMovedCount(0);
    setText("");
    setOcrMessage(null);
  }, []);

  return {
    rootDir,
    text,
    setText,
    folderName,
    setFolderName,
    step,
    matches,
    missing,
    progress,
    movedCount,
    ocrLoading,
    ocrMessage,
    ocrFileRef,
    workerRootPath,
    setWorkerRootPath,
    moveError,
    pickFolder,
    extractNamesFromScreenshot,
    runFindByName,
    runMoveMatched,
    reset,
  };
}

export type SelectMatchFindMoveController = ReturnType<typeof useSelectMatchFindMove>;
