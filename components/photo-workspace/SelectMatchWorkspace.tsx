"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collectJpgFolderGroups,
  type SelectMatchFolderGroup,
} from "@/lib/selectMatch/folderScanner";
import { isCaptureMatchTargetCountConsistent } from "@/lib/selectMatch/captureMatch";
import { C } from "@/lib/theme";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import {
  nextDeliveredRoundFolderName,
} from "@/lib/photo-bridge/rawMatchDelivery";
import {
  defaultWorkerFolderPath,
} from "@/lib/selectMatch/workspaceHelpers";
import {
  collectRatedBasenames,
  collectRatingsByName,
  loadEmbeddedRatings as loadFolderEmbeddedRatings,
  loadSidecarRatings,
  mergeSharedRatings,
} from "@/lib/selectMatch/folderRatings";
import { useSelectMatchFindMove } from "@/components/photo-workspace/useSelectMatchFindMove";
import { useSelectMatchSequenceCheck } from "@/components/photo-workspace/useSelectMatchSequenceCheck";
import { useSelectMatchTargets } from "@/components/photo-workspace/useSelectMatchTargets";
import { useSelectMatchPreflight } from "@/components/photo-workspace/useSelectMatchPreflight";
import { useSelectMatchExecution } from "@/components/photo-workspace/useSelectMatchExecution";
import { useSelectMatchClientInput } from "@/components/photo-workspace/useSelectMatchClientInput";
import { useSelectMatchSceneThumbnails } from "@/components/photo-workspace/useSelectMatchSceneThumbnails";
import {
  RawMatchCriteriaPanel,
  SelectMatchFeatureTabs,
  type SelectMatchFeature,
} from "@/components/photo-workspace/SelectMatchControls";
import { SelectMatchProgramArchiveView, SelectMatchSequenceCheckView } from "@/components/photo-workspace/SelectMatchUtilityViews";
import { SelectMatchFindMoveView } from "@/components/photo-workspace/SelectMatchFindMoveView";
import {
  SelectMatchDoneView,
  SelectMatchLoadingView,
  SelectMatchProgressView,
  SelectMatchRawFolderView,
  SelectMatchSelectionDoneView,
} from "@/components/photo-workspace/SelectMatchStatusViews";
import { SelectMatchPreflightView } from "@/components/photo-workspace/SelectMatchPreflightView";
import { SelectMatchEntryView } from "@/components/photo-workspace/SelectMatchEntryView";
import { SelectMatchReadyView } from "@/components/photo-workspace/SelectMatchReadyView";

/* ── Types ── */
type SceneFolder = SelectMatchFolderGroup;

type Step = "idle" | "loading" | "ready" | "preflight" | "matching" | "done" | "client_input" | "raw_pick" | "selection_done";

export type SelectMatchInitialView = "raw" | "manual" | "client";

export function SelectMatchWorkspace({
  embedded = false,
  bridgeLinked = false,
  initialView = "raw",
  selectionOnly = false,
  selectedJpgNames = [],
  onSelectionComplete,
}: {
  embedded?: boolean;
  bridgeLinked?: boolean;
  initialView?: SelectMatchInitialView;
  /** 사진 셀렉 탭에서는 JPG 목록만 저장하고 RAW 탐색 UI를 렌더하지 않는다. */
  selectionOnly?: boolean;
  /** 사진 셀렉에서 확정한 JPG 이름. RAW 매칭 탭에서만 자동으로 이어받는다. */
  selectedJpgNames?: readonly string[];
  onSelectionComplete?: (names: string[]) => void;
} = {}) {
  const {
    currentLocalFolder,
    rawMatchDefaultFolder,
    rawMatchFolderCandidates,
    setCurrentLocalFolder,
    setSelectedJpgNames,
    jpgRatingsByName,
    setJpgRatingsByName,
    jpgColorLabelsByName,
    rawMatchFolderPath,
    workerPresence,
  } = usePhotoStudioExecution();
  const [step,       setStep]       = useState<Step>("idle");
  const [rootDir,    setRootDir]    = useState<FileSystemDirectoryHandle | null>(null);
  useEffect(() => {
    if (rootDir) setCurrentLocalFolder(rootDir);
  }, [rootDir, setCurrentLocalFolder]);
  useEffect(() => {
    if (!rootDir && currentLocalFolder) setRootDir(currentLocalFolder);
  }, [currentLocalFolder, rootDir]);
  const [scenes,     setScenes]     = useState<SceneFolder[]>([]);
  const [expanded,   setExpanded]   = useState<Set<number>>(new Set());
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [nameQuery,  setNameQuery]  = useState("");
  const queryTokens = useMemo(
    () => nameQuery.toLowerCase().split(/[\s,]+/).map((token) => token.trim()).filter(Boolean),
    [nameQuery],
  );
  /** 검색은 보이는 사진만 거르고 현재 선택은 그대로 유지한다. */
  const visibleScenes = useMemo(() => {
    if (!queryTokens.length) return scenes;
    return scenes
      .map((scene) => ({
        ...scene,
        photos: scene.photos.filter((photo) => (
          queryTokens.some((token) => photo.basename.toLowerCase().includes(token))
        )),
      }))
      .filter((scene) => scene.photos.length > 0);
  }, [queryTokens, scenes]);
  const matchedCount = useMemo(
    () => visibleScenes.reduce((sum, scene) => sum + scene.photos.length, 0),
    [visibleScenes],
  );
  const [ratingLoading, setRatingLoading] = useState(false);
  const [jpgScanRootDir, setJpgScanRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const autoScannedFolderRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [moveMatchedJpgs, setMoveMatchedJpgs] = useState(true);
  const [deliveredFolderName, setDeliveredFolderName] = useState("1차보정본");
  const [deliveredFolderNameDirty, setDeliveredFolderNameDirty] = useState(false);
  const [workerJpgRootPath, setWorkerJpgRootPath] = useState("");
  const [workerRawRootPath, setWorkerRawRootPath] = useState("");
  const [workerPathDirty, setWorkerPathDirty] = useState(false);

  const {
    thumbnailUrlsRef: sceneThumbnailUrlsRef,
    resetSceneThumbnails,
    loadSceneThumbs,
  } = useSelectMatchSceneThumbnails({
    rootDir,
    scenes,
    setScenes,
    searchActive: queryTokens.length > 0,
    visibleScenes,
  });

  // 마운트 전엔 false — 서버 렌더와 클라이언트 첫 렌더를 동일하게 유지해 hydration mismatch를 피한다
  const [hasFS, setHasFS] = useState(false);
  useEffect(() => { setHasFS("showDirectoryPicker" in window); }, []);

  // 같은 도구가 단독 화면에서도 쓰이므로, 사진작업실 안에서만 중성 다크 토큰을 켠다.
  // 선택·파일 처리·매칭 상태에는 관여하지 않는 표시 전용 값이다.
  const surfaceCard = "rgba(255,255,255,.025)";
  const groupedSurface = embedded ? "rgba(255,255,255,.045)" : C.light;
  const inputSurface = embedded ? "rgba(0,0,0,.16)" : C.bg;
  const uiBorder = embedded ? "rgba(255,255,255,.13)" : C.border;
  const uiText = embedded ? "rgba(255,255,255,.88)" : C.txt;
  const uiMuted = embedded ? "rgba(255,255,255,.52)" : C.muted;
  const uiHint = embedded ? "rgba(255,255,255,.42)" : C.hint;
  const uiAccent = embedded ? "#4FD8B8" : C.teal;

  /* ── 기능 선택: RAW 매칭 vs 파일명 이동 vs 순서 검토 vs 프로그램 아카이브 ── */
  const [feature, setFeature] = useState<SelectMatchFeature>("raw_match");

  const {
    rootDir: scRootDir,
    step: scStep,
    result: scResult,
    pickFolder: pickScFolder,
    runCheck: runSequenceCheck,
    reset: resetSequenceCheck,
  } = useSelectMatchSequenceCheck();

  const findMove = useSelectMatchFindMove({ workerOnline: workerPresence.online });

  const {
    rawMatchCriteria,
    setRawMatchCriteria,
    criteriaReady,
    resolvedBridgeTargets,
    authoritativeMatchTargets,
    selectedJpgSources,
    missingMatchTargetBasenames,
    expectedMatchTargetCount,
  } = useSelectMatchTargets({
    bridgeLinked,
    folderKey: rawMatchFolderPath || currentLocalFolder?.name || rootDir?.name || "current-folder",
    selectedJpgNames,
    jpgRatingsByName,
    jpgColorLabelsByName,
    selected,
    scenes,
  });
  const {
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
  } = useSelectMatchPreflight({
    bridgeLinked,
    step,
    setStep,
    rootDir,
    rawMatchDefaultFolder,
    rawMatchFolderCandidates,
    authoritativeMatchTargets,
    selectedJpgSources,
    missingMatchTargetBasenames,
    thumbnailUrlsRef: sceneThumbnailUrlsRef,
  });
  const preflightTargetCountMatches = preflight
    ? missingMatchTargetBasenames.length === 0
      && isCaptureMatchTargetCountConsistent(selectedJpgSources.length, preflight)
    : false;
  const {
    rawSelectMode,
    setRawSelectMode,
    progress,
    setProgress,
    rawOutputPath,
    rawOutputOpenError,
    result,
    remoteExecutionError,
    runMatch,
    cancelRemoteRawMatch,
    openRawOutputFolder,
    resetOutputStatus,
  } = useSelectMatchExecution({
    setStep,
    rootDir,
    rawRootDir,
    jpgScanRootName: jpgScanRootDir?.name ?? "",
    preflight,
    approvedMatches,
    preflightTargetCountMatches,
    workerOnline: workerPresence.online,
    workerRawRootPath,
    workerJpgRootPath,
    moveMatchedJpgs,
    deliveredFolderName,
  });

  useEffect(() => {
    if (workerPathDirty) return;
    let jpgPath = defaultWorkerFolderPath(rawMatchFolderPath, rootDir?.name ?? currentLocalFolder?.name ?? "");
    if (jpgScanRootDir && rootDir && jpgScanRootDir.name.normalize("NFC") !== rootDir.name.normalize("NFC")) {
      jpgPath = `${jpgPath.replace(/\/$/u, "")}/${jpgScanRootDir.name}`;
    }
    setWorkerJpgRootPath(jpgPath);
    const pathSegments = jpgPath.replace(/^\/Volumes\//u, "").split("/").filter(Boolean);
    const rawName = rawRootDir?.name.normalize("NFC") ?? "";
    const rawIndex = rawName
      ? pathSegments.findLastIndex((segment) => segment.normalize("NFC") === rawName)
      : -1;
    setWorkerRawRootPath(rawIndex >= 0
      ? `/Volumes/${pathSegments.slice(0, rawIndex + 1).join("/")}`
      : rawName ? `/Volumes/${rawName}` : jpgPath);
  }, [currentLocalFolder?.name, jpgScanRootDir, rawMatchFolderPath, rawRootDir?.name, rootDir, workerPathDirty]);

  useEffect(() => {
    if (!rootDir) {
      setJpgScanRootDir(null);
      return;
    }
    let disposed = false;
    void (async () => {
      let next = rootDir;
      try {
        next = await rootDir.getDirectoryHandle("JPG");
      } catch {
        // 선택한 폴더가 곧 JPG 폴더인 일반적인 Bridge 경로다.
      }
      if (!disposed) setJpgScanRootDir(next);
    })();
    return () => { disposed = true; };
  }, [rootDir]);

  useEffect(() => {
    if (!jpgScanRootDir) return;
    let disposed = false;
    void (async () => {
      const names: string[] = [];
      try {
        for await (const [name, handle] of (jpgScanRootDir as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
          if (handle.kind === "directory") names.push(name);
        }
      } catch {
        return;
      }
      if (!disposed && !deliveredFolderNameDirty) setDeliveredFolderName(nextDeliveredRoundFolderName(names));
    })();
    return () => { disposed = true; };
  }, [deliveredFolderNameDirty, jpgScanRootDir]);

  const completeSelection = useCallback((names: Set<string>) => {
    const selectedNames = Array.from(names);
    setSelectedJpgNames(selectedNames);
    onSelectionComplete?.(selectedNames);
    setStep("selection_done");
  }, [onSelectionComplete, setSelectedJpgNames]);

  const handleClientInputConfirmed = useCallback((names: Set<string>) => {
    setSelected(names);
    if (selectionOnly) {
      completeSelection(names);
      return;
    }
    setStep("raw_pick");
  }, [completeSelection, selectionOnly]);

  const clientInput = useSelectMatchClientInput({
    initialMode: initialView === "client" ? "text" : "folder",
    onConfirm: handleClientInputConfirmed,
  });

  useEffect(() => {
    if (!selectionOnly || step !== "ready") return;
    setSelectedJpgNames([...selected]);
  }, [selected, selectionOnly, setSelectedJpgNames, step]);

  useEffect(() => {
    if (selectionOnly || initialView !== "raw" || step !== "idle" || selectedJpgNames.length === 0 || !criteriaReady) return;
    // The photo-select store keeps JPG basenames (the RAW matcher uses the
    // basename too), while pasted text may include extensions. Do not route
    // the stored list back through the text-only parser.
    const names = bridgeLinked
      ? new Set(resolvedBridgeTargets)
      : new Set(selectedJpgNames
        .map((name) => name.trim().replace(/\.[^.]+$/, "").normalize("NFC").toLocaleLowerCase("en-US"))
        .filter(Boolean));
    setSelected(names);
    setStep("raw_pick");
  }, [bridgeLinked, criteriaReady, initialView, resolvedBridgeTargets, selectedJpgNames, selectionOnly, step]);

  useEffect(() => {
    if (!bridgeLinked || initialView !== "raw" || (step !== "raw_pick" && step !== "preflight")) return;
    setSelected(new Set(resolvedBridgeTargets));
  }, [bridgeLinked, initialView, resolvedBridgeTargets, step]);

  /* ── 폴더 로드: 이름 규칙 없이 JPG 폴더 재귀 스캔 ── */
  const scanFolder = useCallback(async (dir: FileSystemDirectoryHandle) => {
      resetSceneThumbnails();
      setRootDir(dir);
      setStep("loading");
      setProgress({ cur: 0, total: 0, msg: "JPG 폴더 스캔 중..." });

      // JPG/ 폴더 탐색
      let jpgBase: FileSystemDirectoryHandle | null = null;
      try { jpgBase = await (dir as any).getDirectoryHandle("JPG"); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }

      // JPG/ 없으면 루트 직접 사용
      const scanDir = jpgBase ?? dir;
      setJpgScanRootDir(scanDir);
      setDeliveredFolderNameDirty(false);
      const sceneList = await collectJpgFolderGroups(scanDir);
      setScenes(sceneList);
      setExpanded(new Set());

      // XMP 사이드카 빠른 스캔 → 이후 JPG 내장 XMP 자동 딥스캔
      if (!(bridgeLinked && initialView === "raw")) setStep("ready");
      setRatingLoading(true);

      // 1단계: .xmp 사이드카
      const afterSidecar = await loadSidecarRatings(sceneList, jpgRatingsByName);
      setScenes(afterSidecar);

      // 2단계: 사이드카 없는 JPG는 내장 XMP 스캔
      const afterEmbedded = await loadFolderEmbeddedRatings(afterSidecar);
      setScenes(afterEmbedded);
      setJpgRatingsByName(collectRatingsByName(afterEmbedded), { overwrite: false });

      // Bridge RAW 매칭은 위의 "매칭 기준" 결과만 사용한다. 폴더 스캔에서 새로 발견한
      // 하위 폴더 별점 JPG를 대상에 합치면 화면 수와 사전 확인 수가 달라진다.
      const autoKeys = bridgeLinked && initialView === "raw"
        ? new Set(resolvedBridgeTargets)
        : new Set(selectedJpgNames
          .map((name) => name.trim().replace(/\.[^.]+$/, "").normalize("NFC").toLocaleLowerCase("en-US"))
          .filter(Boolean));
      if (!(bridgeLinked && initialView === "raw")) {
        for (const basename of collectRatedBasenames(afterEmbedded)) autoKeys.add(basename);
      }
      setSelected(autoKeys);

      setRatingLoading(false);
      if (bridgeLinked && initialView === "raw") setStep("raw_pick");
  }, [bridgeLinked, initialView, jpgRatingsByName, resetSceneThumbnails, resolvedBridgeTargets, selectedJpgNames, setJpgRatingsByName, setProgress]);

  const loadFolder = useCallback(async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      await scanFolder(dir);
    } catch (e: any) {
      if (e?.name !== "AbortError") alert("폴더를 읽는 중 오류가 발생했습니다.");
      setStep("idle");
    }
  }, [scanFolder]);

  useEffect(() => {
    const shouldScanBridgeFolder = selectionOnly || (bridgeLinked && initialView === "raw");
    if (!shouldScanBridgeFolder || !currentLocalFolder || step !== "idle" || autoScannedFolderRef.current === currentLocalFolder) return;
    autoScannedFolderRef.current = currentLocalFolder;
    void scanFolder(currentLocalFolder).catch((error) => {
      console.error("[photo-select] Bridge folder scan failed", error);
      setStep("idle");
    });
  }, [bridgeLinked, currentLocalFolder, initialView, scanFolder, selectedJpgNames.length, selectionOnly, step]);

  /* ── JPG 내장 XMP 딥스캔 (사이드카 없을 때) ── */
  const loadEmbeddedRatings = useCallback(async () => {
    setRatingLoading(true);
    const updated = await loadFolderEmbeddedRatings(scenes);
    setScenes(updated);
    setJpgRatingsByName(collectRatingsByName(updated), { overwrite: false });
    setRatingLoading(false);
  }, [scenes, setJpgRatingsByName]);

  useEffect(() => {
    if (!scenes.length) return;
    setScenes((current) => mergeSharedRatings(current, jpgRatingsByName));
  }, [jpgRatingsByName, scenes.length]);

  /* ── 별점 기준 자동 선택 ── */
  const autoSelectByRating = useCallback((minRating: number) => {
    setSelected(collectRatedBasenames(scenes, minRating));
  }, [scenes]);

  const totalPhotos = scenes.reduce((a, s) => a + s.photos.length, 0);

  const controlColors = {
    surfaceCard,
    groupedSurface,
    inputSurface,
    uiBorder,
    uiText,
    uiMuted,
    uiHint,
    uiAccent,
  };
  const featureTabs = (
    <SelectMatchFeatureTabs
      embedded={embedded}
      feature={feature}
      onChange={setFeature}
      colors={controlColors}
    />
  );
  const rawMatchCriteriaPanel = (
    <RawMatchCriteriaPanel
      visible={bridgeLinked && selectedJpgNames.length > 0}
      criteria={rawMatchCriteria}
      expectedCount={expectedMatchTargetCount}
      onChange={(next) => {
        setRawMatchCriteria(next);
        resetForCriteria();
      }}
      colors={controlColors}
    />
  );

  /* ── 모바일 자동화 > 프로그램 아카이브 ── */
  if (feature === "program_archive") return <SelectMatchProgramArchiveView featureTabs={featureTabs} colors={controlColors} />;

  /* ── 파일명으로 찾아 이동 ── */
  if (feature === "find_move") return <SelectMatchFindMoveView
    featureTabs={featureTabs}
    hasFileSystemAccess={hasFS}
    workerOnline={workerPresence.online}
    controller={findMove}
    colors={controlColors}
  />;

  /* ── 파일 순서 검토 ── */
  if (feature === "seq_check") return <SelectMatchSequenceCheckView
    featureTabs={featureTabs}
    step={scStep}
    rootDir={scRootDir}
    result={scResult}
    hasFileSystemAccess={hasFS}
    onPickFolder={() => void pickScFolder()}
    onRun={() => void runSequenceCheck()}
    onReset={resetSequenceCheck}
    colors={controlColors}
  />;

  /* ── Idle ── */
  if (step === "idle") return <SelectMatchEntryView
    featureTabs={featureTabs}
    embedded={embedded}
    initialView={initialView}
    selectionOnly={selectionOnly}
    hasFileSystemAccess={hasFS}
    onLoadFolder={loadFolder}
    controller={clientInput}
    colors={controlColors}
  />;
  /* ── RAW 폴더 선택 (client_input 이후) ── */
  if (step === "raw_pick") return <SelectMatchRawFolderView
    criteriaPanel={rawMatchCriteriaPanel}
    bridgeLinked={bridgeLinked}
    expectedCount={expectedMatchTargetCount}
    discovery={rawDiscovery}
    targets={authoritativeMatchTargets}
    onCancel={() => { setStep("idle"); setSelected(new Set()); }}
    onPick={() => void pickRawFolderAndPreflight()}
    colors={controlColors}
  />;

  if (step === "selection_done") return <SelectMatchSelectionDoneView
    selectedCount={selected.size}
    onReset={() => { setStep("idle"); setSelected(new Set()); }}
    colors={controlColors}
  />;

  /* ── Loading ── */
  if (step === "loading") return <SelectMatchLoadingView message={progress.msg} colors={controlColors} />;

  /* ── Preflight ── */
  if (step === "preflight") return <SelectMatchPreflightView
    criteriaPanel={rawMatchCriteriaPanel}
    preflight={preflight}
    manualRawChoices={manualRawChoices}
    setManualRawChoices={setManualRawChoices}
    rawScanCount={rawScanCount}
    rawDiscovery={rawDiscovery}
    expectedTargetCount={expectedMatchTargetCount}
    targetCountMatches={preflightTargetCountMatches}
    approvedMatchCount={approvedMatches.length}
    rawSelectMode={rawSelectMode}
    onRawSelectModeChange={setRawSelectMode}
    moveMatchedJpgs={moveMatchedJpgs}
    onMoveMatchedJpgsChange={setMoveMatchedJpgs}
    deliveredFolderName={deliveredFolderName}
    onDeliveredFolderNameChange={(value) => {
      setDeliveredFolderNameDirty(true);
      setDeliveredFolderName(value);
    }}
    workerOnline={workerPresence.online}
    workerRawRootPath={workerRawRootPath}
    workerJpgRootPath={workerJpgRootPath}
    onWorkerRawRootPathChange={(value) => {
      setWorkerPathDirty(true);
      setWorkerRawRootPath(value);
    }}
    onWorkerJpgRootPathChange={(value) => {
      setWorkerPathDirty(true);
      setWorkerJpgRootPath(value);
    }}
    remoteExecutionError={remoteExecutionError}
    onCancel={cancelPreflight}
    onRun={() => void runMatch()}
    colors={controlColors}
  />;

  /* ── Matching ── */
  if (step === "matching") return <SelectMatchProgressView
    progress={progress}
    onCancel={cancelRemoteRawMatch}
    colors={controlColors}
  />;

  /* ── Done ── */
  if (step === "done") return <SelectMatchDoneView
    result={result}
    rawSelectMode={rawSelectMode}
    rawOutputPath={rawOutputPath}
    rawOutputOpenError={rawOutputOpenError}
    onOpenOutput={() => void openRawOutputFolder()}
    onAgain={() => { setStep("ready"); resetOutputStatus(); }}
    onReset={() => { setStep("idle"); setRootDir(null); setScenes([]); setSelected(new Set()); resetOutputStatus(); }}
    colors={controlColors}
  />;

  /* ── Ready: 썸네일 그리드 선택 UI ── */
  return <SelectMatchReadyView
    scenes={scenes}
    visibleScenes={visibleScenes}
    queryTokens={queryTokens}
    nameQuery={nameQuery}
    onNameQueryChange={setNameQuery}
    matchedCount={matchedCount}
    totalPhotos={totalPhotos}
    selected={selected}
    setSelected={setSelected}
    expanded={expanded}
    setExpanded={setExpanded}
    ratingLoading={ratingLoading}
    onAutoSelectByRating={autoSelectByRating}
    onLoadEmbeddedRatings={loadEmbeddedRatings}
    selectionOnly={selectionOnly}
    bridgeLinked={bridgeLinked}
    rawRootDir={rawRootDir}
    onCompleteSelection={completeSelection}
    onRunPreflight={runPreflight}
    onPickRawFolder={pickRawFolder}
    onChangeFolder={() => {
      setStep("idle");
      setRootDir(null);
      setRawRootDir(null);
      setScenes([]);
      setSelected(new Set());
    }}
    onLoadSceneThumbs={loadSceneThumbs}
    colors={controlColors}
  />;
}
