"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, MessageSquare, ScanSearch, Upload } from "lucide-react";
import {
  collectJpgFolderGroups,
  type SelectMatchFolderGroup,
} from "@/lib/selectMatch/folderScanner";
import {
  parseNamesFromText,
  parseNamesFromFiles,
} from "@/lib/selectMatch/nameParsing";
import {
  captureMatchSummaryTotal,
  isCaptureMatchTargetCountConsistent,
} from "@/lib/selectMatch/captureMatch";
import { formatCaptureTime } from "@/lib/selectMatch/captureTime";
import { C } from "@/lib/theme";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import {
  nextDeliveredRoundFolderName,
} from "@/lib/photo-bridge/rawMatchDelivery";
import {
  remoteRawMatchUnavailableReason,
} from "@/lib/selectMatch/remoteRawMatch";
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
  SelectMatchButton,
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
  const [ratingLoaded,  setRatingLoaded]  = useState(false);
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

  const {
    inputMode,
    setInputMode,
    clientText,
    setClientText,
    clientDragging,
    setClientDragging,
    clientFileRef,
    uploadedClientFiles,
    uploadOcrLoading,
    uploadOcrNames,
    selectedUploadOcrNames,
    setSelectedUploadOcrNames,
    uploadOcrMessage,
    confirmClientInput,
    setUploadedFiles,
    analyzeUploadedFileNames,
  } = useSelectMatchClientInput({
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
      setRatingLoaded(false);

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

      setRatingLoaded(true);
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
    setRatingLoaded(true);
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
  const entryModes = ([
    { key: "folder", icon: <FolderOpen size={15} strokeWidth={2} aria-hidden="true" />, title: "폴더 직접 선택", desc: "JPG 폴더를 열어서\n시각적으로 베스트컷 선택" },
    { key: "text",   icon: <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />, title: "텍스트 붙여넣기", desc: "카카오톡·메모 등\n파일명 목록을 붙여넣기" },
    { key: "upload", icon: <Upload size={15} strokeWidth={2} aria-hidden="true" />, title: "파일 업로드", desc: "고객이 보낸 JPG 파일을\n직접 드래그 & 드롭" },
  ] as const).filter((item) => initialView === "raw" || (initialView === "manual" ? item.key === "folder" : item.key !== "folder"));

  if (step === "idle") return (
    <div style={{ maxWidth: 660, margin: embedded ? "0 auto" : "32px auto", padding: embedded ? "24px 20px 28px" : "0 20px" }}>
      {featureTabs}
      {!embedded ? <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: uiAccent }}>RAW 매칭</div>
        <div style={{ fontSize: 12, color: uiMuted, marginTop: 4 }}>고객 선택 정보를 어떻게 받으셨나요?</div>
      </div> : null}

      {/* 3가지 진입 모드 */}
      {initialView !== "manual" ? <div style={{ display: "grid", gridTemplateColumns: `repeat(${entryModes.length}, minmax(0, 1fr))`, gap: 10, marginBottom: 20 }}>
        {entryModes.map(m => (
          <button type="button" key={m.key} onClick={() => setInputMode(m.key)}
            aria-pressed={inputMode === m.key}
            style={{
              background: inputMode === m.key ? (embedded ? "rgba(48,174,146,.14)" : groupedSurface) : surfaceCard,
              border: `1.5px solid ${inputMode === m.key ? uiAccent : uiBorder}`,
              borderRadius: 12, padding: "18px 14px", textAlign: "center", cursor: "pointer",
              transition: "background .2s cubic-bezier(.32,.72,0,1), border-color .2s cubic-bezier(.32,.72,0,1)", fontFamily: "inherit",
            }}>
            <div style={{ minHeight: 22, display: "grid", placeItems: "center", marginBottom: 8, color: inputMode === m.key ? uiAccent : uiMuted }}>{m.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: inputMode === m.key ? uiAccent : uiText, marginBottom: 4 }}>{m.title}</div>
            <div style={{ fontSize: 10, color: uiHint, lineHeight: 1.6, whiteSpace: "pre-line" }}>{m.desc}</div>
          </button>
        ))}
      </div> : null}

      {/* 폴더 선택 모드 */}
      {inputMode === "folder" && (
        <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 12, color: uiMuted, lineHeight: 1.8, marginBottom: 18, textAlign: "center" }}>
            분류된 JPG 폴더를 선택하면 폴더 이름과 관계없이<br />
            하위 사진을 찾아 그룹별로 베스트컷을 선택할 수 있습니다.
          </div>
          {!hasFS ? (
            <div style={{ fontSize: 12, color: C.red, textAlign: "center" }}>Chrome 또는 Edge를 사용해주세요.</div>
          ) : (
            <div style={{ textAlign: "center" }}><SelectMatchButton dark={embedded} onClick={loadFolder}><FolderOpen size={16} aria-hidden="true" />폴더 선택</SelectMatchButton></div>
          )}
          <div style={{ marginTop: 16, background: groupedSurface, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: uiMuted, lineHeight: 1.9 }}>
            {selectionOnly ? (
              <>JPG 또는 분류된 사진 폴더를 선택하세요.<br />선택 결과는 사진 작업실의 JPG 선택 목록에만 저장됩니다.</>
            ) : (
              <>촬영폴더/<br />
                &nbsp;&nbsp;├ <strong>JPG/분류폴더들/</strong> ← JPG 또는 촬영폴더 선택<br />
                &nbsp;&nbsp;├ <strong>RAW/</strong> — 전체 RAW<br />
                &nbsp;&nbsp;└ <strong>Selected_RAW/</strong> — 결과물 자동 생성</>
            )}
          </div>
        </div>
      )}

      {/* 텍스트 붙여넣기 모드 */}
      {inputMode === "text" && (
        <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 12, color: uiMuted, lineHeight: 1.7, marginBottom: 14 }}>
            카카오톡 대화, 이메일, 메모 등에서 파일명이 담긴 텍스트를 그대로 붙여넣으세요.<br />
            <span style={{ color: uiHint }}>DSC_0142.jpg 형태의 파일명을 자동 추출합니다.</span>
          </div>
          <textarea
            value={clientText}
            onChange={e => setClientText(e.target.value)}
            placeholder={"예시:\nDSC_0142.jpg, DSC_0145.jpg\nDSC_0148.jpg\nDSC_0151.jpg ..."}
            rows={7}
            style={{ width: "100%", border: `1px solid ${uiBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical", background: inputSurface, color: uiText, boxSizing: "border-box" }}
          />
          {clientText.trim() && (() => {
            const names = parseNamesFromText(clientText);
            return (
              <div style={{ marginTop: 10, background: groupedSurface, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: uiMuted }}>
                파일명 <strong style={{ color: uiAccent }}>{names.size}개</strong> 추출됨
                {names.size > 0 && (
                  <span style={{ marginLeft: 8, color: uiHint }}>
                    {Array.from(names).slice(0, 3).join(", ")}{names.size > 3 ? ` 외 ${names.size - 3}개` : ""}
                  </span>
                )}
              </div>
            );
          })()}
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <SelectMatchButton dark={embedded} onClick={() => confirmClientInput(parseNamesFromText(clientText))} disabled={!clientText.trim()}>
              {selectionOnly ? "선택 목록 저장" : "다음 — RAW 폴더 선택"}
            </SelectMatchButton>
          </div>
        </div>
      )}

      {/* 파일 업로드 모드 */}
      {inputMode === "upload" && (
        <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 12, color: uiMuted, lineHeight: 1.7, marginBottom: 14 }}>
            고객이 선택해서 보낸 JPG 파일 또는 셀렉 리포트 스크린샷을 아래 영역에 드래그하거나 클릭해서 선택하세요.<br />
            <span style={{ color: uiHint }}>일반 JPG는 파일명 그대로, 리포트 이미지는 화면 안의 파일명을 분석해 RAW 매칭에 사용합니다.</span>
          </div>
          <input ref={clientFileRef} type="file" multiple accept="image/*,.jpg,.jpeg,.heic,.png,.tif"
            style={{ display: "none" }}
            onChange={e => { if (e.target.files) setUploadedFiles(e.target.files); }} />
          <div
            onDragOver={e => { e.preventDefault(); setClientDragging(true); }}
            onDragLeave={() => setClientDragging(false)}
            onDrop={e => { e.preventDefault(); setClientDragging(false); setUploadedFiles(e.dataTransfer.files); }}
            onClick={() => clientFileRef.current?.click()}
            style={{
              border: `2px dashed ${clientDragging ? uiAccent : uiBorder}`,
              borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer",
              background: clientDragging ? groupedSurface : inputSurface, transition: "all .2s",
            }}>
            <FolderOpen size={32} aria-hidden="true" style={{ marginBottom: 10, color: uiAccent }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: uiAccent, marginBottom: 4 }}>파일을 드래그하거나 클릭</div>
            <div style={{ fontSize: 11, color: uiHint }}>선택 후 파일명 그대로 사용하거나 이미지 안 파일명을 분석할 수 있습니다.</div>
          </div>
          {uploadedClientFiles.length > 0 && (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: inputSurface }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: uiAccent }}>업로드한 파일 {uploadedClientFiles.length}개</div>
              <div style={{ marginTop: 5, maxHeight: 52, overflowY: "auto", fontSize: 10, color: uiMuted, lineHeight: 1.65 }}>
                {uploadedClientFiles.map((file) => file.name).join(", ")}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <SelectMatchButton dark={embedded} variant="secondary" onClick={() => confirmClientInput(parseNamesFromFiles(uploadedClientFiles))}>
                  파일명 그대로 사용
                </SelectMatchButton>
                <SelectMatchButton dark={embedded} variant="secondary" disabled={uploadOcrLoading} onClick={() => void analyzeUploadedFileNames()}>
                  {uploadOcrLoading ? "🔎 이미지 분석 중..." : "🔎 이미지 속 파일명 분석"}
                </SelectMatchButton>
              </div>
            </div>
          )}
          {uploadOcrMessage && (
            <div style={{ marginTop: 12, borderRadius: 9, padding: "10px 12px", fontSize: 11, fontWeight: 500, color: uploadOcrMessage.ok ? (embedded ? "#A8F1DC" : C.green) : C.red, background: uploadOcrMessage.ok ? groupedSurface : (embedded ? "rgba(232,93,44,.10)" : "#FEF2F2") }}>
              {uploadOcrMessage.text}
            </div>
          )}
          {uploadOcrNames.length > 0 && (
            <div style={{ marginTop: 12, border: `1px solid ${uiBorder}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 12px", background: groupedSurface, color: uiAccent, fontSize: 11, fontWeight: 500 }}>
                <span>인식된 파일명 {uploadOcrNames.length}개</span>
                <span>{selectedUploadOcrNames.size}개 선택</span>
              </div>
              <div style={{ maxHeight: 162, overflowY: "auto", padding: "7px 12px" }}>
                {uploadOcrNames.map((name) => {
                  const checked = selectedUploadOcrNames.has(name);
                  return (
                    <label key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", color: uiText, fontSize: 11, fontFamily: "monospace", lineHeight: 1.5 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedUploadOcrNames((current) => {
                          const next = new Set(current);
                          if (next.has(name)) next.delete(name);
                          else next.add(name);
                          return next;
                        })}
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
              <div style={{ padding: "0 12px 12px", textAlign: "right" }}>
                <SelectMatchButton dark={embedded} disabled={selectedUploadOcrNames.size === 0} onClick={() => confirmClientInput(new Set(selectedUploadOcrNames))}>{selectionOnly ? "선택한 인식 목록 저장" : `선택한 ${selectedUploadOcrNames.size}개로 RAW 매칭`}</SelectMatchButton>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

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
  if (step === "preflight") {
    const unresolvedItems = preflight?.items.filter((item) => item.status !== "confirmed") ?? [];
    const manualCount = Object.keys(manualRawChoices).length;
    const preflightSummaryTotal = preflight ? captureMatchSummaryTotal(preflight) : 0;
    return (
    <div style={{ maxWidth: 960, margin: "28px auto", padding: "0 24px" }}>
      {rawMatchCriteriaPanel}
      <div style={{ background: surfaceCard, borderRadius: 16, border: `1px solid ${uiBorder}`, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "14px 20px", borderBottom: `1px solid ${uiBorder}`, fontSize: 13, fontWeight: 600, color: uiAccent }}>
          <ScanSearch size={16} aria-hidden="true" /> 매칭 사전 확인
        </div>
        {rawDiscovery.folderName ? <div style={{ padding: "9px 20px", borderBottom: `1px solid ${uiBorder}`, color: uiMuted, fontSize: 11 }}>
          RAW 원본 폴더 · <strong style={{ color: uiAccent, fontWeight: 600 }}>{rawDiscovery.folderName}</strong>
        </div> : null}
        {!preflight ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div style={{ height: 6, background: uiBorder, borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                height: "100%", width: "40%", borderRadius: 3, background: uiAccent,
                animation: "select-match-scan-bar 1.1s ease-in-out infinite",
              }} />
            </div>
            <div style={{ fontSize: 12, color: uiHint }}>
              RAW 후보와 촬영시각 확인 중{rawScanCount > 0 ? ` — ${rawScanCount.toLocaleString()}장 완료` : "..."}
            </div>
            <style>{`@keyframes select-match-scan-bar { 0% { margin-left: 0%; } 50% { margin-left: 60%; } 100% { margin-left: 0%; } }`}</style>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginBottom: 18 }}>
              {[
                { label: "확정", value: preflight.confirmed, color: C.green },
                { label: "촬영시각 불일치", value: preflight.timeMismatch, color: preflight.timeMismatch ? C.red : uiHint },
                { label: "후보 여러 개", value: preflight.multipleCandidates, color: preflight.multipleCandidates ? "#D6BC7D" : uiHint },
                { label: "촬영시각 없음", value: preflight.missingTime, color: preflight.missingTime ? "#D6BC7D" : uiHint },
                { label: "RAW 없음", value: preflight.rawMissing, color: preflight.rawMissing ? C.red : uiHint },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: inputSurface, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
                  <div style={{ fontSize: 10, color: uiHint, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div role="status" style={{ background: groupedSurface, border: `1px solid ${uiBorder}`, borderRadius: 9, padding: "10px 13px", color: uiText, fontSize: 12, marginBottom: 16 }}>
              매칭 {preflight.items.length.toLocaleString("ko-KR")}장 = <strong style={{ color: C.green }}>확정 {preflight.confirmed.toLocaleString("ko-KR")}장</strong>
              {` · 촬영시각 불일치 ${preflight.timeMismatch.toLocaleString("ko-KR")}장 · 후보 여러 개 ${preflight.multipleCandidates.toLocaleString("ko-KR")}장 · 촬영시각 없음 ${preflight.missingTime.toLocaleString("ko-KR")}장`}
              {preflight.rawMissing ? ` · RAW 없음 ${preflight.rawMissing.toLocaleString("ko-KR")}장` : ""}
              {manualCount ? <strong style={{ color: uiAccent }}> · 직접 선택 {manualCount.toLocaleString("ko-KR")}장</strong> : null}
            </div>

            {!preflightTargetCountMatches ? (
              <div role="alert" style={{ background: "#FEF2F2", border: "1px solid rgba(201,74,30,.35)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>
                대상 수가 맞지 않습니다. 매칭 기준 {expectedMatchTargetCount.toLocaleString("ko-KR")}장 · 사전 확인 {preflight.items.length.toLocaleString("ko-KR")}장 · 상태 합계 {preflightSummaryTotal.toLocaleString("ko-KR")}장입니다. 폴더를 다시 확인해 주세요.
              </div>
            ) : preflight.items.length === 0 ? (
              <div role="alert" style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>
                촬영시각을 확인할 JPG 원본 파일을 찾지 못했습니다. 파일명 목록만으로는 안전하게 매칭하지 않습니다. JPG가 들어 있는 촬영 폴더를 다시 열어 주세요.
              </div>
            ) : preflight.rawFound === 0 ? (
              <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>
                RAW 파일을 찾지 못했습니다. 상단의 <strong>RAW 폴더 선택</strong> 버튼으로 올바른 폴더를 선택해주세요.
              </div>
            ) : preflight.confirmed === 0 && manualCount === 0 ? (
              <div style={{ background: "#FEF9C3", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#92400E", marginBottom: 16 }}>
                자동 확정된 RAW가 없습니다. 아래 경로와 촬영시각을 확인하고 필요한 항목만 직접 선택해 주세요.
              </div>
            ) : null}

            {unresolvedItems.length > 0 ? <div style={{ display: "grid", gap: 10, marginBottom: 18, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
              {unresolvedItems.map((item) => {
                const statusLabel = item.status === "time_mismatch" ? "촬영시각 불일치" : item.status === "multiple_candidates" ? "후보 여러 개" : item.status === "missing_time" ? "촬영시각 없음" : "RAW 없음";
                return <div key={item.id} style={{ display: "grid", gridTemplateColumns: "112px minmax(0, .9fr) minmax(0, 1.5fr)", gap: 12, padding: 12, border: `1px solid ${uiBorder}`, borderRadius: 10, background: inputSurface }}>
                  <div style={{ height: 82, borderRadius: 7, overflow: "hidden", background: "rgba(0,0,0,.28)", display: "grid", placeItems: "center" }}>
                    {item.jpg.thumbUrl ? <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 FileSystemHandle에서 만든 blob 썸네일 */}
                      <img src={item.jpg.thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </> : <span style={{ color: uiHint, fontSize: 10 }}>미리보기 없음</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", color: uiText, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>{item.jpg.name}</strong>
                    <span style={{ display: "block", color: uiHint, fontSize: 10, marginTop: 4, overflowWrap: "anywhere" }}>{item.jpg.relativePath}</span>
                    <span style={{ display: "block", color: uiMuted, fontSize: 10, marginTop: 6 }}>{formatCaptureTime(item.jpgCaptureTime)}</span>
                    <span style={{ display: "inline-block", color: item.status === "time_mismatch" || item.status === "raw_missing" ? C.red : "#D6BC7D", fontSize: 10, marginTop: 6, fontWeight: 600 }}>{statusLabel}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {item.candidates.length > 0 ? <>
                      <select
                        aria-label={`${item.jpg.name} RAW 직접 선택`}
                        value={manualRawChoices[item.id] ?? ""}
                        onChange={(event) => setManualRawChoices((current) => {
                          const next = { ...current };
                          if (event.currentTarget.value) next[item.id] = event.currentTarget.value;
                          else delete next[item.id];
                          return next;
                        })}
                        style={{ width: "100%", minHeight: 40, border: `1px solid ${uiBorder}`, borderRadius: 8, background: surfaceCard, color: uiText, padding: "0 9px", font: "inherit", fontSize: 10 }}
                      >
                        <option value="">복사하지 않음</option>
                        {item.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.entry.relativePath} · {formatCaptureTime(candidate.captureTime)}</option>)}
                      </select>
                      <div style={{ marginTop: 7, display: "grid", gap: 4 }}>
                        {item.candidates.map((candidate) => <div key={candidate.id} style={{ color: uiHint, fontSize: 9, overflowWrap: "anywhere" }}>
                          {candidate.entry.relativePath} · {formatCaptureTime(candidate.captureTime)}{candidate.differenceMs !== null ? ` · 차이 ${(candidate.differenceMs / 1000).toFixed(3)}초` : ""}
                        </div>)}
                      </div>
                      {item.status === "missing_time" && item.candidates.length === 1 && !manualRawChoices[item.id] ? <button
                        type="button"
                        onClick={() => setManualRawChoices((current) => ({ ...current, [item.id]: item.candidates[0].id }))}
                        style={{ marginTop: 8, minHeight: 34, border: `1px solid ${uiBorder}`, borderRadius: 7, background: groupedSurface, color: uiAccent, padding: "0 10px", font: "inherit", fontSize: 10, cursor: "pointer" }}
                      >파일명만으로 매칭</button> : null}
                    </> : <span style={{ color: C.red, fontSize: 10 }}>같은 파일명의 RAW 후보가 없습니다.</span>}
                  </div>
                </div>;
              })}
            </div> : null}

            {approvedMatches.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: uiHint, marginBottom: 6 }}>매칭된 RAW 처리 방식</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {([["copy", "복사 (원본 유지)"], ["move", "이동 (원본 삭제)"]] as const).map(([mode, label]) => (
                    <button key={mode} onClick={() => setRawSelectMode(mode)} style={{
                      flex: 1, padding: "10px 0", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                      border: `1.5px solid ${rawSelectMode === mode ? uiAccent : uiBorder}`,
                      background: rawSelectMode === mode ? groupedSurface : surfaceCard,
                      color: rawSelectMode === mode ? uiAccent : uiMuted,
                      fontSize: 12, fontWeight: 600,
                    }}>{label}</button>
                  ))}
                </div>
                {rawSelectMode === "move" && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(214,188,125,.12)", borderRadius: 8, fontSize: 11, color: "#D6BC7D", border: "1px solid rgba(214,188,125,.36)" }}>
                    ⚠️ 이동을 선택하면 원본 RAW 파일이 원래 위치에서 삭제됩니다.
                  </div>
                )}
              </div>
            )}

            {approvedMatches.length > 0 && (
              <div style={{ marginBottom: 16, padding: "12px 14px", border: `1px solid ${uiBorder}`, borderRadius: 10, background: groupedSurface }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, color: uiText, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={moveMatchedJpgs} onChange={(event) => setMoveMatchedJpgs(event.currentTarget.checked)} />
                  매칭한 JPG를 보정본 폴더로 옮기기
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, opacity: moveMatchedJpgs ? 1 : .45 }}>
                  <span style={{ color: uiMuted, fontSize: 11 }}>JPG 폴더 안</span>
                  <input
                    value={deliveredFolderName}
                    disabled={!moveMatchedJpgs}
                    aria-label="매칭한 JPG를 옮길 폴더 이름"
                    onChange={(event) => {
                      setDeliveredFolderNameDirty(true);
                      setDeliveredFolderName(event.currentTarget.value);
                    }}
                    style={{ minHeight: 38, flex: 1, minWidth: 0, border: `1px solid ${uiBorder}`, borderRadius: 8, background: inputSurface, color: uiText, padding: "0 10px", font: "inherit", fontSize: 11 }}
                  />
                  <span style={{ color: uiMuted, fontSize: 11 }}>폴더</span>
                </div>
                <p style={{ margin: "8px 0 0", color: uiHint, fontSize: 10, lineHeight: 1.55 }}>RAW 복사가 성공한 JPG와 같은 이름의 XMP만 Mac Studio가 이동합니다. 같은 볼륨은 이름만 옮기고, 다른 볼륨은 ditto 복사·속성 확인 후 원본을 지웁니다.</p>
              </div>
            )}

            {approvedMatches.length > 0 ? (
              <div style={{ marginBottom: 16, padding: "12px 14px", border: `1px solid ${uiBorder}`, borderRadius: 10, background: groupedSurface }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <strong style={{ color: uiText, fontSize: 11 }}>Mac Studio 원본 경로</strong>
                  <span style={{ color: workerPresence.online ? C.green : C.red, fontSize: 10 }}>{workerPresence.online ? "워커 연결됨" : "워커 연결 안 됨"}</span>
                </div>
                <label style={{ display: "grid", gap: 6, color: uiMuted, fontSize: 10, marginBottom: 9 }}>
                  RAW 기준 폴더
                  <input
                    value={workerRawRootPath}
                    onChange={(event) => { setWorkerPathDirty(true); setWorkerRawRootPath(event.currentTarget.value); }}
                    placeholder="/Volumes/Agentstation/촬영폴더/RAW"
                    style={{ minHeight: 40, border: `1px solid ${uiBorder}`, borderRadius: 8, background: inputSurface, color: uiText, padding: "0 10px", font: "inherit", fontSize: 11 }}
                  />
                </label>
                {moveMatchedJpgs ? <label style={{ display: "grid", gap: 6, color: uiMuted, fontSize: 10 }}>
                  JPG 기준 폴더
                  <input
                    value={workerJpgRootPath}
                    onChange={(event) => { setWorkerPathDirty(true); setWorkerJpgRootPath(event.currentTarget.value); }}
                    placeholder="/Volumes/Agentstation/촬영폴더/JPG전체"
                    style={{ minHeight: 40, border: `1px solid ${uiBorder}`, borderRadius: 8, background: inputSurface, color: uiText, padding: "0 10px", font: "inherit", fontSize: 11 }}
                  />
                </label> : null}
                <p style={{ margin: "8px 0 0", color: uiHint, fontSize: 10, lineHeight: 1.55 }}>워커가 먼저 표본 2개의 크기와 촬영시각을 확인합니다. 자동으로 찾지 못할 때만 Mac Studio Finder의 절대경로로 고쳐 주세요.</p>
              </div>
            ) : null}

            {remoteRawMatchUnavailableReason(workerPresence.online) ? (
              <div role="alert" style={{ marginBottom: 12, borderRadius: 8, padding: "10px 12px", background: "#FEF2F2", color: C.red, fontSize: 11 }}>{remoteRawMatchUnavailableReason(workerPresence.online)}</div>
            ) : null}
            {remoteExecutionError ? <div role="alert" style={{ marginBottom: 12, borderRadius: 8, padding: "10px 12px", background: "#FEF2F2", color: C.red, fontSize: 11 }}>{remoteExecutionError}</div> : null}

            <div style={{ display: "flex", gap: 8 }}>
              <SelectMatchButton variant="secondary" onClick={cancelPreflight}>← 취소</SelectMatchButton>
              {approvedMatches.length > 0 && (
                <SelectMatchButton disabled={!preflightTargetCountMatches || workerPresence.online !== true || !workerRawRootPath.trim() || (moveMatchedJpgs && !workerJpgRootPath.trim())} onClick={runMatch}>{manualCount ? "확정 + 직접 선택" : "확정된 것만"} {rawSelectMode === "move" ? "이동" : "복사"} ({approvedMatches.length}개)</SelectMatchButton>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
  }

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
  const ratingCounts = [5,4,3,2,1].map(r => ({
    r,
    count: scenes.flatMap(s => s.photos).filter(p => p.rating !== null && p.rating >= r).length,
  }));
  const hasAnyRating = scenes.flatMap(s => s.photos).some(p => p.rating !== null);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>

      {/* Bridge 별점 자동 선택 바 */}
      <div style={{ background: "rgba(214,188,125,.12)", border: "1px solid rgba(214,188,125,.36)", borderRadius: 12, padding: "12px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#92400E" }}>
          ⭐ Bridge 별점으로 자동 선택
          {ratingLoading && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: "#B45309" }}>읽는 중...</span>}
        </div>
        {hasAnyRating ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ratingCounts.map(({ r, count }) => (
              <button
                key={r}
                onClick={() => autoSelectByRating(r)}
                disabled={count === 0}
                style={{
                  padding: "4px 12px", fontSize: 11, fontWeight: 500, borderRadius: 8,
                  border: "1px solid #FDE68A", cursor: count === 0 ? "not-allowed" : "pointer",
                  background: count > 0 ? "#FEF3C7" : "#F9FAFB", color: count > 0 ? "#92400E" : "#9CA3AF",
                  fontFamily: "inherit",
                }}
              >{"★".repeat(r)}{"☆".repeat(5-r)} 이상 ({count}장)</button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#B45309" }}>
              {ratingLoading ? "XMP 사이드카 스캔 중..." : "사이드카(.xmp) 없음 — JPG 내 XMP 스캔"}
            </span>
            {!ratingLoading && (
              <button
                onClick={loadEmbeddedRatings}
                style={{ padding: "4px 12px", fontSize: 11, fontWeight: 500, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, cursor: "pointer", color: "#92400E", fontFamily: "inherit" }}
              >JPG에서 별점 읽기</button>
            )}
          </div>
        )}
      </div>

      {/* 상단 액션바 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: surfaceCard, borderRadius: 12, border: `1px solid ${uiBorder}`, padding: "12px 18px", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 600, color: uiAccent }}>{selected.size}장 선택됨</span>
            <span style={{ fontSize: 11, color: uiHint, marginLeft: 8 }}>
              {queryTokens.length ? `${matchedCount}장 찾음 / 전체 ${totalPhotos}장` : `/ 전체 ${totalPhotos}장 (${scenes.length}씬)`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={() => setSelected(new Set(scenes.flatMap(s => s.photos.map(p => p.basename.toLowerCase()))))}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: groupedSurface, border: `1px solid ${uiBorder}`, borderRadius: 6, cursor: "pointer", color: uiAccent, fontFamily: "inherit" }}
            >전체 선택</button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 6, cursor: "pointer", color: uiMuted, fontFamily: "inherit" }}
            >전체 해제</button>
            <input
              type="search"
              value={nameQuery}
              onChange={(event) => setNameQuery(event.currentTarget.value)}
              placeholder="파일명 검색 (R5K, DSC…)"
              aria-label="파일명 검색"
              autoComplete="off"
              style={{ width: 190, maxWidth: "100%", padding: "4px 10px", fontSize: 11, background: inputSurface, border: `1px solid ${uiBorder}`, borderRadius: 6, color: uiText, fontFamily: "inherit", outline: "none" }}
            />
            {queryTokens.length ? <button
              type="button"
              onClick={() => setSelected((previous) => {
                const next = new Set(previous);
                for (const scene of visibleScenes) {
                  for (const photo of scene.photos) next.add(photo.basename.toLowerCase());
                }
                return next;
              })}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: groupedSurface, border: `1px solid ${uiBorder}`, borderRadius: 6, cursor: "pointer", color: uiAccent, fontFamily: "inherit", whiteSpace: "nowrap" }}
            >검색 결과 {matchedCount}장 선택</button> : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {selectionOnly ? (
            <SelectMatchButton onClick={() => completeSelection(selected)} disabled={selected.size === 0}>
              {selected.size > 0 ? `선택 ${selected.size}장 저장` : "사진을 선택하세요"}
            </SelectMatchButton>
          ) : (
            <>
              <SelectMatchButton onClick={runPreflight} disabled={selected.size === 0}>
                {selected.size > 0 ? `${selected.size}장 RAW 매칭 확인` : "사진을 선택하세요"}
              </SelectMatchButton>
              <button
                onClick={pickRawFolder}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                  background: rawRootDir ? "#DCFCE7" : "#FEF9C3",
                  border: `1px solid ${rawRootDir ? "#86EFAC" : "#FDE68A"}`,
                  borderRadius: 8, color: rawRootDir ? "#166534" : "#92400E",
                }}
                title={rawRootDir ? `RAW 폴더: ${rawRootDir.name}` : "RAW 파일이 있는 폴더를 별도로 선택"}
              >{rawRootDir ? <><FolderOpen size={14} aria-hidden="true" />{rawRootDir.name}</> : <><FolderOpen size={14} aria-hidden="true" />RAW 폴더 선택</>}</button>
            </>
          )}
          {!bridgeLinked ? <button
            onClick={() => { setStep("idle"); setRootDir(null); setRawRootDir(null); setScenes([]); setSelected(new Set()); }}
            style={{ padding: "6px 10px", fontSize: 11, background: "transparent", border: `1px solid ${uiBorder}`, borderRadius: 8, cursor: "pointer", color: uiMuted, fontFamily: "inherit" }}
          >폴더 변경</button> : null}
        </div>
      </div>

      {/* 씬별 패널 */}
      {scenes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: uiHint, fontSize: 13 }}>
          JPG 파일을 찾지 못했습니다. 폴더를 다시 확인해주세요.
        </div>
      ) : queryTokens.length && visibleScenes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: uiHint, fontSize: 13 }}>
          &quot;{nameQuery.trim()}&quot;와 맞는 파일이 없습니다
        </div>
      ) : (
        visibleScenes.map((scene, si) => {
          const sourceSceneIndex = queryTokens.length
            ? scenes.findIndex((candidate) => candidate.dirHandle === scene.dirHandle)
            : si;
          const sceneSelCount = scene.photos.filter(p => selected.has(p.basename.toLowerCase())).length;
          const isExpanded = queryTokens.length > 0 || expanded.has(sourceSceneIndex);
          return (
            <div key={sourceSceneIndex} style={{ background: surfaceCard, borderRadius: 12, border: `1px solid ${uiBorder}`, overflow: "hidden", marginBottom: 10 }}>
              {/* 씬 헤더 */}
              <div
                onClick={() => {
                  if (queryTokens.length) return;
                  setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(sourceSceneIndex)) { next.delete(sourceSceneIndex); }
                    else { next.add(sourceSceneIndex); loadSceneThumbs(sourceSceneIndex); }
                    return next;
                  });
                }}
                style={{ padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: sceneSelCount > 0 ? uiAccent : uiBorder,
                    display: "flex", alignItems: "center", justifyContent: "center", color: sceneSelCount > 0 ? "#103E36" : uiMuted, fontSize: 12, fontWeight: 500, transition: "background .2s", flexShrink: 0,
                  }}>{sourceSceneIndex + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: uiText }}>{scene.name}</div>
                    <div style={{ fontSize: 10, color: uiHint }}>{scene.photos.length}장</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {sceneSelCount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 500, color: uiAccent, background: groupedSurface, padding: "3px 10px", borderRadius: 12 }}>✓ {sceneSelCount}장</span>
                  )}
                  {/* 빠른 전체선택 */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const keys = scene.photos.map(p => p.basename.toLowerCase());
                      const allSel = keys.every(k => selected.has(k));
                      setSelected(prev => {
                        const next = new Set(prev);
                        if (allSel) keys.forEach(k => next.delete(k));
                        else keys.forEach(k => next.add(k));
                        return next;
                      });
                    }}
                    style={{ padding: "3px 8px", fontSize: 10, fontWeight: 500, background: groupedSurface, border: `1px solid ${uiBorder}`, borderRadius: 6, cursor: "pointer", color: uiAccent, fontFamily: "inherit" }}
                  >{scene.photos.every(p => selected.has(p.basename.toLowerCase())) ? "해제" : "씬 전체"}</button>
                  <span style={{ fontSize: 10, color: uiHint, width: 12 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* 썸네일 그리드 */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${uiBorder}`, padding: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
                    {scene.photos.map(p => {
                      const k = p.basename.toLowerCase();
                      const isSel = selected.has(k);
                      return (
                        <div
                          key={p.name}
                          onClick={() => setSelected(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                          style={{
                            // OLIVIA OS 1차 작업 지시서 6단계 — 선택 표시를 테두리가 아니라
                            // 우상단 체크 배지로 통일한다(배지는 이미 있었다, 테두리 강조만
                            // 없앤다). 테두리를 선택 여부와 무관하게 고정해서 사진 색 판단에
                            // 방해되는 색 테두리 대비를 없앤다.
                            position: "relative", cursor: "pointer", borderRadius: 7, overflow: "hidden",
                            border: `1.5px solid ${uiBorder}`,
                            aspectRatio: "3/2", background: "#e5eeec",
                          }}
                        >
                          {p.thumbUrl
                            ? <img src={p.thumbUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            : <div style={{ width: "100%", height: "100%", background: "#dde8e6" }} />
                          }
                          {isSel && (
                            <div style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: uiAccent, boxShadow: "0 0 0 2px rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#103E36", fontWeight: 600 }}>✓</div>
                          )}
                          {p.rating !== null && (
                            <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,.6)", borderRadius: 4, padding: "1px 4px", fontSize: 8, color: "#FBBF24", letterSpacing: -1 }}>
                              {"★".repeat(p.rating)}{"☆".repeat(5 - p.rating)}
                            </div>
                          )}
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,.5)", padding: "2px 4px", fontSize: 7, color: "rgba(255,255,255,.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* 하단 플로팅 알약 바 (선택 시만) — OLIVIA OS 1차 작업 지시서 6단계: 선택 개수 /
          전체 해제 / 다음 단계를 한 알약 안에 모은다. borderRadius를 완전한 캡슐 모양으로. */}
      {selected.size > 0 && (
        <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ pointerEvents: "all", background: uiAccent, color: "#103E36", borderRadius: 999, padding: "10px 12px 10px 22px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(21,88,85,.35)" }}>
            <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>{selected.size}장 선택됨</span>
            <button
              onClick={() => setSelected(new Set())}
              style={{ padding: "7px 16px", background: "transparent", border: "1px solid rgba(16,62,54,.4)", borderRadius: 999, color: "#103E36", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >전체 해제</button>
            <button
              onClick={() => runPreflight()}
              style={{ padding: "7px 18px", background: "rgba(16,62,54,.12)", border: "1px solid rgba(16,62,54,.4)", borderRadius: 999, color: "#103E36", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily:"inherit", whiteSpace: "nowrap" }}
            >RAW 매칭 확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
