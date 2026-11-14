"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  buildCaptureMatchPreflight,
  type CaptureMatchPreflight,
  type JpgMatchSource,
} from "@/lib/selectMatch/captureMatch";
import { loadBrowserThumbnail, releaseObjectUrl } from "@/lib/selectMatch/browserThumbnail";
import { buildRawIndex, type RawIndex } from "@/lib/selectMatch/rawIndex";
import { discoverRawFolder } from "@/lib/selectMatch/rawFolderDiscovery";
import type { BridgeRawFolderCandidate } from "@/lib/photo-bridge/recentFolder";
import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";

type SelectMatchStep = "idle" | "loading" | "ready" | "preflight" | "matching" | "done" | "client_input" | "raw_pick" | "selection_done";

export type RawDiscoveryState = {
  status: "idle" | "searching" | "found" | "not_found" | "error" | "manual";
  message: string;
  folderName?: string;
};

export type ApprovedCaptureMatch = {
  item: CaptureMatchPreflight["items"][number];
  candidate: CaptureMatchPreflight["items"][number]["candidates"][number];
  manual: boolean;
};

export function useSelectMatchPreflight({
  bridgeLinked,
  step,
  setStep,
  rootDir,
  rawMatchDefaultFolder,
  rawMatchFolderCandidates,
  authoritativeMatchTargets,
  selectedJpgSources,
  missingMatchTargetBasenames,
  thumbnailUrlsRef,
}: {
  bridgeLinked: boolean;
  step: SelectMatchStep;
  setStep: Dispatch<SetStateAction<SelectMatchStep>>;
  rootDir: FileSystemDirectoryHandle | null;
  rawMatchDefaultFolder: FileSystemDirectoryHandle | null;
  rawMatchFolderCandidates: readonly BridgeRawFolderCandidate[];
  authoritativeMatchTargets: ReadonlySet<string>;
  selectedJpgSources: readonly JpgMatchSource[];
  missingMatchTargetBasenames: readonly string[];
  thumbnailUrlsRef: RefObject<Set<string>>;
}) {
  const [rawRootDir, setRawRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [preflight, setPreflight] = useState<CaptureMatchPreflight | null>(null);
  const [manualRawChoices, setManualRawChoices] = useState<Record<string, string>>({});
  const [rawScanCount, setRawScanCount] = useState(0);
  const rawIndexRef = useRef<RawIndex>(new Map());
  const preflightRequestRef = useRef(0);
  const [rawDiscovery, setRawDiscovery] = useState<RawDiscoveryState>({ status: "idle", message: "" });
  const rawDiscoveryKeyRef = useRef("");
  const rawTargetBasenames = useMemo(
    () => new Set(selectedJpgSources.map((source) => normalizePhotoToolFileKey(source.basename)).filter(Boolean)),
    [selectedJpgSources],
  );

  const approvedMatches = useMemo<ApprovedCaptureMatch[]>(() => (preflight?.items.flatMap((item) => {
    const candidateId = manualRawChoices[item.id] ?? item.confirmedCandidateId;
    if (!candidateId) return [];
    const candidate = item.candidates.find((entry) => entry.id === candidateId);
    return candidate ? [{ item, candidate, manual: Boolean(manualRawChoices[item.id]) }] : [];
  }) ?? []), [manualRawChoices, preflight]);

  useEffect(() => {
    if (!bridgeLinked || rawRootDir || !rawMatchDefaultFolder) return;
    setRawRootDir(rawMatchDefaultFolder);
  }, [bridgeLinked, rawMatchDefaultFolder, rawRootDir]);

  const buildIndex = useCallback((
    overrideRawDir?: FileSystemDirectoryHandle,
    onProgress?: (scannedCount: number) => void,
  ) => buildRawIndex(
    overrideRawDir ?? rawRootDir,
    rootDir,
    onProgress,
    rawTargetBasenames,
  ), [rawRootDir, rawTargetBasenames, rootDir]);

  const runPreflight = useCallback(async (overrideRawDir?: FileSystemDirectoryHandle) => {
    if (!authoritativeMatchTargets.size || (!rootDir && !rawRootDir && !overrideRawDir)) return;
    if (overrideRawDir) setRawRootDir(overrideRawDir);
    const requestId = preflightRequestRef.current + 1;
    preflightRequestRef.current = requestId;
    setStep("preflight");
    setPreflight(null);
    setManualRawChoices({});
    setRawScanCount(0);
    const rawIndex = await buildIndex(overrideRawDir, setRawScanCount);
    if (preflightRequestRef.current !== requestId) return;
    if (missingMatchTargetBasenames.length) {
      setRawDiscovery({
        status: "error",
        message: `선택 JPG ${missingMatchTargetBasenames.length}장의 원본 파일을 찾지 못했습니다. JPG 폴더를 다시 열어 주세요.`,
      });
    }
    const capturePreflight = await buildCaptureMatchPreflight({
      jpgSources: [...selectedJpgSources],
      rawIndex,
      concurrency: 8,
      onProgress: setRawScanCount,
    });
    if (preflightRequestRef.current !== requestId) return;
    rawIndexRef.current = rawIndex;
    const unresolved = capturePreflight.items.filter((item) => item.status !== "confirmed" && !item.jpg.thumbUrl);
    for (const item of unresolved) {
      if (preflightRequestRef.current !== requestId) return;
      try {
        const url = await loadBrowserThumbnail(await item.jpg.handle.getFile(), 180);
        if (!url) continue;
        if (preflightRequestRef.current !== requestId) {
          releaseObjectUrl(url);
          return;
        }
        thumbnailUrlsRef.current.add(url);
        item.jpg.thumbUrl = url;
      } catch {
        // 썸네일 실패는 촬영시각 안전 검사 결과에 영향을 주지 않는다.
      }
    }
    if (preflightRequestRef.current !== requestId) return;
    setPreflight(capturePreflight);
  }, [authoritativeMatchTargets, buildIndex, missingMatchTargetBasenames, rawRootDir, rootDir, selectedJpgSources, setStep, thumbnailUrlsRef]);

  useEffect(() => {
    if (!bridgeLinked || step !== "raw_pick" || !authoritativeMatchTargets.size || !selectedJpgSources.length || !rawMatchFolderCandidates.length) return;
    const selectionKey = Array.from(authoritativeMatchTargets).sort().join("|");
    const discoveryKey = `${rawMatchFolderCandidates.map((item) => `${item.distance}:${item.name}`).join("|")}::${selectionKey}`;
    if (rawDiscoveryKeyRef.current === discoveryKey) return;
    rawDiscoveryKeyRef.current = discoveryKey;
    let disposed = false;

    setRawDiscovery({ status: "searching", message: "현재 폴더와 상위 폴더에서 RAW 원본 위치를 찾고 있습니다." });
    void discoverRawFolder({
      candidates: rawMatchFolderCandidates,
      selectedNames: rawTargetBasenames,
      onCandidate: (candidate, index, total) => {
        if (!disposed) {
          setRawDiscovery({
            status: "searching",
            message: `${candidate.name} 폴더 확인 중 (${index}/${total})`,
            folderName: candidate.name,
          });
        }
      },
    }).then(async (result) => {
      if (disposed) return;
      if (!result.candidate) {
        const timedOut = result.attempts
          .filter((attempt) => attempt.status === "timeout")
          .map((attempt) => attempt.name);
        setRawDiscovery({
          status: "not_found",
          message: `RAW 폴더를 찾지 못했어요 · 직접 지정${timedOut.length ? ` (${timedOut.join(", ")} 시간 초과)` : ""}`,
        });
        return;
      }
      const folderName = result.candidate.name;
      setRawRootDir(result.candidate.handle);
      setRawDiscovery({
        status: "found",
        folderName,
        message: `${folderName}에서 표본 ${result.matchedSamples}/${result.samples.length}개를 찾았습니다. 전체 선택 파일을 확인합니다.`,
      });
      await runPreflight(result.candidate.handle);
    }).catch((error) => {
      if (disposed) return;
      setRawDiscovery({
        status: "error",
        message: error instanceof Error ? error.message : "RAW 원본 폴더를 자동으로 찾지 못했습니다.",
      });
    });

    return () => { disposed = true; };
  }, [authoritativeMatchTargets, bridgeLinked, rawMatchFolderCandidates, rawTargetBasenames, runPreflight, selectedJpgSources.length, step]);

  const pickRawFolder = useCallback(async () => {
    try {
      const directory = await (window as typeof window & {
        showDirectoryPicker(options: { mode: "readwrite" }): Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker({ mode: "readwrite" });
      setRawRootDir(directory);
      setRawDiscovery({ status: "manual", folderName: directory.name, message: `${directory.name} 폴더를 직접 선택했습니다.` });
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") alert("폴더 선택 실패");
    }
  }, []);

  const pickRawFolderAndPreflight = useCallback(async () => {
    try {
      const directory = await (window as typeof window & {
        showDirectoryPicker(options: { mode: "readwrite" }): Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker({ mode: "readwrite" });
      setRawDiscovery({ status: "manual", folderName: directory.name, message: `${directory.name} 폴더를 직접 선택했습니다.` });
      await runPreflight(directory);
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") alert("폴더 선택 실패");
    }
  }, [runPreflight]);

  const resetForCriteria = useCallback(() => {
    preflightRequestRef.current += 1;
    rawDiscoveryKeyRef.current = "";
    rawIndexRef.current.clear();
    setPreflight(null);
    setManualRawChoices({});
    if (step === "preflight") setStep("raw_pick");
  }, [setStep, step]);

  const cancelPreflight = useCallback(() => {
    preflightRequestRef.current += 1;
    setStep("ready");
  }, [setStep]);

  return {
    rawRootDir,
    setRawRootDir,
    preflight,
    manualRawChoices,
    setManualRawChoices,
    rawScanCount,
    rawDiscovery,
    approvedMatches,
    runPreflight,
    pickRawFolder,
    pickRawFolderAndPreflight,
    resetForCriteria,
    cancelPreflight,
  };
}
