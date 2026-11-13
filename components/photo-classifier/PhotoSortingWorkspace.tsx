"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FieldScene, FieldStats, MedicalDepartment } from "@/lib/photo-classifier/types";
import { DEPARTMENT_DISPLAY } from "@/lib/photo-classifier/types";
import {
  manualPhotoDepartmentResolution,
  resolvePhotoDepartmentEvidence,
} from "@/lib/photo-classifier/departmentResolver";
import type { SceneMergeCandidate, MergeDecision } from "@/lib/photo-classifier/scene-merge-types";
import { usePhotoClassificationHandoffStore } from "@/lib/store/usePhotoClassificationHandoffStore";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import type {
  AccuracyReport, ClassificationJobState, SceneBoundaryDecision,
  SceneCorrection,
} from "@/lib/photo-classifier/hybrid-types";
import { analyzeBrowserFieldFolder } from "@/lib/photo-classifier/fieldFolderAnalysis";
import { runBrowserFieldClassification } from "@/lib/photo-classifier/browserFieldClassificationRunner";
import { runBrowserFieldReviewConfirmation } from "@/lib/photo-classifier/browserFieldReviewRunner";
import { runFieldSceneAiAnalysis } from "@/lib/photo-classifier/fieldSceneAiRunner";
import {
  applyOverrides, adjustGranularity,
  DEFAULT_WEIGHT_PROFILE,
  type FolderShootingPattern, type SceneWeightProfile, type SceneProposal, type ClassificationOverrides,
} from "@/lib/photo-classifier/pattern-analysis";
import type { ClassificationUiMode } from "./ai-auto/ClassificationModeToggle";
import FolderAnalysisSummary from "./ai-auto/FolderAnalysisSummary";
import ClassificationPrompt from "./ai-auto/ClassificationPrompt";
import SceneProposalList from "./ai-auto/SceneProposalList";
import ClassificationProfilePanel from "./ai-auto/ClassificationProfilePanel";
import PhotoSourcePicker from "./PhotoSourcePicker";
import { usePhotoSourceSurface } from "./usePhotoSourceSurface";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import {
  prepareBridgeClassificationPlan,
} from "@/lib/photo-bridge/classificationPlanApply";
import {
  type PersonGroup,
  type StudioGroup,
  type StudioGroupSortMode,
  type StudioOptions,
  type StudioPhotoFile,
  type StudioStats,
  type StudioSubMode,
} from "@/lib/photo-classifier/studioGrouping";
import {
  runBrowserStudioClassification,
  runBrowserStudioOutput,
} from "@/lib/photo-classifier/browserStudioClassificationRunner";
import { buildQuickProposals } from "@/lib/photo-classifier/browserProcessing";
import {
  type SavedSortingSession,
} from "@/lib/photo-classifier/sortingSession";
import {
  restoreSortingSession,
} from "@/lib/photo-classifier/sortingSessionRestore";
import {
  C,
} from "./PhotoSortingUi";
import { useRemoteWorkFolderCheck } from "./useRemoteWorkFolderCheck";
import { useRemotePhotoSortSubmission } from "./useRemotePhotoSortSubmission";
import { usePhotoDepartmentContext } from "./usePhotoDepartmentContext";
import { useRemotePhotoSourceSelection } from "./useRemotePhotoSourceSelection";
import { usePhotoSortingSession } from "./usePhotoSortingSession";
import { usePhotoClassificationProgress } from "./usePhotoClassificationProgress";
import { PhotoSourceControl } from "./PhotoSourceControl";
import { PhotoDepartmentControl } from "./PhotoDepartmentControl";
import type { PhotoShootingMode } from "./PhotoShootingModeControl";
import { FieldClassificationSettings } from "./FieldClassificationSettings";
import { StudioClassificationSettings } from "./StudioClassificationSettings";
import {
  FieldAnalysisProgressStep,
  FieldOutputProgressStep,
  StudioFileScanProgressStep,
  StudioOutputProgressStep,
  StudioPhotoAnalysisProgressStep,
} from "./PhotoSortingProgressSteps";
import { PhotoSortingWorkspaceShell } from "./PhotoSortingWorkspaceShell";
import { FieldSceneReviewStep } from "./FieldSceneReviewStep";
import {
  StudioClassificationCompletionStep,
  StudioConceptConfirmationStep,
  StudioConceptEditStep,
  StudioPersonConfirmationStep,
  StudioPersonEditStep,
} from "./StudioClassificationReviewSteps";
import { FieldClassificationCompleteView } from "./FieldClassificationCompleteView";
import { PhotoSortingSetupView } from "./PhotoSortingSetupView";
import { useFieldSceneReviewActions } from "./useFieldSceneReviewActions";
import { usePhotoSortingSourceActions } from "./usePhotoSortingSourceActions";

/* ════════════════════════════════════════════════
   SHARED TYPES
═══════════════════════════════════════════════ */
type PhotoMode = PhotoShootingMode;

/* ════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
// 우상단 전역 작업 팝업(BackgroundJobsWidget)에 등록할 때 쓰는 고정 job id — handleFieldSort만
// 이 id로 startJob을 부른다(스튜디오 모드 handleStudioSort는 범위 밖, 이 id로 등록 안 함).
const PHOTO_CLASSIFY_JOB_ID = "photo-classify";
// 사진 분류는 Scene/촬영 카테고리 정리까지만 담당한다. JPG 셀렉과 RAW 매칭은
// 각각 사진 셀렉/RAW 매칭 워크스페이스의 독립 단계다.
const FIELD_STEPS  = ["설정","파일 분류","씬 검토","정리 중","완료"];
const STUDIO_STEPS       = ["폴더 선택","파일 분류","AI 분석","그룹 검토","그룹 확인","파일 정리","완료"];
const STUDIO_GROUP_STEPS = ["폴더 선택","파일 분류","AI 분석","인물 검토","인물 확인","파일 정리","완료"];

/* ════════════════════════════════════════════════
   FIELD-MODE HELPERS
═══════════════════════════════════════════════ */
/* ════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
// PHASE 4(사진 분류 Chat-native Workflow, 2026-08-30) — 원래 app/(photo-studio)/photo-sorting/page.tsx의
// 전체 내용을 그대로 옮긴 파일이다(로직 무변경, 기계적 이동). QuoteBuilder.tsx/ContractBuilder.tsx와
// 동일한 mode="page"|"modal" 패턴을 얹어 워크스페이스(Split Layout) 안에서도 재사용한다 —
// 분류 알고리즘(handleFieldSort/handleStudioSort 등)은 컴포넌트 로컬 state에 강하게 결합돼 있어
// 별도 모듈로 추출하지 않고, "같은 컴포넌트를 두 곳에서 마운트"하는 전략을 쓴다.
export default function PhotoSortingWorkspace({
  mode = "page",
  clientId: modalClientId,
  workflowRunId: modalWorkflowRunId,
  initialRemoteSelection,
  onOpenPhotoSelect,
}: {
  mode?: "page" | "modal" | "embedded";
  clientId?: string;
  workflowRunId?: string;
  initialRemoteSelection?: RemoteNasSelection;
  resourceId?: string;
  onClose?: () => void;
  onOpenPhotoSelect?: () => void;
} = {}) {
  return (
    <Suspense fallback={null}>
      <PhotoSortingInner mode={mode} modalClientId={modalClientId} modalWorkflowRunId={modalWorkflowRunId} initialRemoteSelection={initialRemoteSelection} onOpenPhotoSelect={onOpenPhotoSelect} />
    </Suspense>
  );
}

function PhotoSortingInner({
  mode = "page",
  modalClientId,
  modalWorkflowRunId,
  initialRemoteSelection,
  onOpenPhotoSelect,
}: {
  mode?: "page" | "modal" | "embedded";
  modalClientId?: string;
  modalWorkflowRunId?: string;
  initialRemoteSelection?: RemoteNasSelection;
  onOpenPhotoSelect?: () => void;
}) {
  const { supported: hasFS, pick: pickPhotoFolder, error: folderPickerError } = usePhotoFolderPicker();
  const isModal = mode === "modal";
  const isEmbedded = mode === "embedded";
  const sp = useSearchParams();
  const clientId = modalClientId ?? sp.get("clientId") ?? sp.get("client_id") ?? "";
  const workflowRunId = modalWorkflowRunId ?? sp.get("workflowRunId") ?? "";
  const photoSourceSurface = usePhotoSourceSurface();
  const {
    executionMode,
    remoteJob: remotePhotoSortJob,
    remoteJobActive,
    remotePollingState,
    remotePollingMessage,
    trackRemoteJob,
    clearRemoteJob,
    cancelRemoteJob,
    workerPresence,
    currentLocalFolder,
    setCurrentLocalFolder,
    pendingBridgeClassificationPlan,
    takeBridgeClassificationPlan,
    photoDepartmentResolution,
    setPhotoDepartmentResolution,
  } = usePhotoStudioExecution();

  /* ── shared state ── */
  const [photoMode,  setPhotoMode]  = useState<PhotoMode>("field");
  const [step,       setStep]       = useState(0);
  const [rootDir,    setRootDir]    = useState<FileSystemDirectoryHandle | null>(null);
  useEffect(() => {
    if (rootDir) setCurrentLocalFolder(rootDir);
  }, [rootDir, setCurrentLocalFolder]);
  const cancelRef = useRef(false);
  // 사진 분류(handleFieldSort)가 다른 페이지로 이동해도 우상단 팝업에 계속 보이게
  // (BackgroundJobsWidget) — 로컬 state는 그대로 두고 전역 스토어에도 같이 반영만 한다.
  // handleFieldSort 안의 기존 setProgress(...) 호출부는 이름이 그대로라 하나도 안 건드려도 된다.
  // (스튜디오 모드 handleStudioSort는 startJob을 안 부르므로 이 미러링은 조용히 no-op된다.)
  const {
    progress,
    updateProgress: setProgress,
  } = usePhotoClassificationProgress(PHOTO_CLASSIFY_JOB_ID);
  // 폴더 선택 실패를 화면에 보여준다 — 예전엔 catch가 비어 있어서 실패해도 아무 반응이 없었다
  // (사용자 보고: "키 자체가 안먹혀" — 버튼을 눌러도 그냥 아무 일도 안 일어남).
  const [dirPickError, setDirPickError] = useState("");
  useEffect(() => {
    if (folderPickerError) setDirPickError(folderPickerError);
  }, [folderPickerError]);
  // Olivia OS 2.0 PHASE 6 §11 — BACKUP_READY 알림의 "분류 시작"이 NAS 폴더 탐색을 대신 해주는
  // prefill이다. 파라미터가 있으면 폴더 선택 단계만 건너뛰고, department/gap_minutes 등 분류
  // 설정은 그대로 이 화면에서 사용자가 확정하게 둔다(기존 PHOTO_SORT 파라미터 수집 로직 재사용).
  const {
    closePicker: closePhotoSourcePicker,
    openPicker: openRemotePhotoSourcePicker,
    pickerOpen: photoSourcePickerOpen,
    select: selectRemotePhotoSource,
    selection: remoteSelection,
  } = useRemotePhotoSourceSelection({
    enabled: executionMode === "REMOTE_WORKER",
    initialSelection: initialRemoteSelection,
    prefillPath: sp.get("remoteFolder"),
  });
  const remoteWorkerOffline = workerPresence.online === false;
  const {
    state: remoteWorkFolderCheck,
    ready: remoteWorkFolderReady,
    check: requestRemoteWorkFolderCheck,
  } = useRemoteWorkFolderCheck({
    enabled: executionMode === "REMOTE_WORKER",
    sourceFolder: remoteSelection?.path,
  });

  /* ── field state ── */
  const [department,                 setDepartment]                 = useState<MedicalDepartment>("dermatology");
  const [gapMinutes,                 setGapMinutes]                 = useState(3.5);
  const [fastAnalyzeMode,            setFastAnalyzeMode]            = useState(false);
  const [departmentLogicEnabled,     setDepartmentLogicEnabled]     = useState(true);
  const [aiNamingEnabled,            setAiNamingEnabled]            = useState(false);
  const [qualityAnalysisEnabled,     setQualityAnalysisEnabled]     = useState(false);
  const [profileClassificationEnabled, setProfileClassificationEnabled] = useState(false);
  const [rawSelectMode,              setRawSelectMode]              = useState<"move"|"copy">("move");
  const [fieldScenes,                setFieldScenes]                = useState<FieldScene[]>([]);
  const [fieldRawCount,              setFieldRawCount]              = useState(0);
  const [fieldRawHandles,            setFieldRawHandles]            = useState<{ name: string; handle: FileSystemFileHandle }[]>([]);
  const [fieldJpgBaseDir,            setFieldJpgBaseDir]            = useState<FileSystemDirectoryHandle | null>(null);
  const [fieldStats,                 setFieldStats]                 = useState<FieldStats | null>(null);
  const [copyLog,                    setCopyLog]                    = useState<string[]>([]);
  const [classificationJobState,     setClassificationJobState]     = useState<ClassificationJobState>("IDLE");
  const [boundaryDecisions,          setBoundaryDecisions]          = useState<SceneBoundaryDecision[]>([]);
  const [sceneCorrections,           setSceneCorrections]           = useState<SceneCorrection[]>([]);
  const [splitPositions,             setSplitPositions]             = useState<Record<number, number>>({});
  const [evaluationMode,             setEvaluationMode]             = useState(false);
  const [groundTruthBoundaries,      setGroundTruthBoundaries]      = useState<number[]>([]);
  const [groundTruthSelection,       setGroundTruthSelection]       = useState(1);
  const [accuracyReport,             setAccuracyReport]             = useState<AccuracyReport | null>(null);
  const classificationAbortRef = useRef<AbortController | null>(null);
  const [mergeCandidates,            setMergeCandidates]            = useState<SceneMergeCandidate[]>([]);
  const [dismissedCandidates,        setDismissedCandidates]        = useState<Set<string>>(new Set());
  const [mergeDecisions,             setMergeDecisions]             = useState<MergeDecision[]>([]);
  const [bridgePlanSummary, setBridgePlanSummary] = useState<{ sceneCount: number; jpgCount: number; reviewCount: number } | null>(null);
  const departmentFolderName = executionMode === "LOCAL_DIRECT"
    ? rootDir?.name ?? ""
    : remoteSelection?.path ?? "";
  const {
    chooseDepartment: chooseFieldDepartment,
    contextKeyRef: departmentContextKeyRef,
    error: departmentContextError,
    loading: departmentContextLoading,
    pickerOpen: departmentPickerOpen,
    requestPicker: requestDepartmentPicker,
    setError: setDepartmentContextError,
    setPickerOpen: setDepartmentPickerOpen,
  } = usePhotoDepartmentContext({
    enabled: photoMode === "field" && !pendingBridgeClassificationPlan,
    clientId,
    workflowRunId,
    folderName: departmentFolderName,
    setDepartment,
    setResolution: setPhotoDepartmentResolution,
  });

  // A folder chosen by 사진 셀렉/RAW 매칭/T컷 is the same active work folder.
  // Do not replace a folder this classifier already owns during an in-progress session.
  useEffect(() => {
    if (!rootDir && currentLocalFolder) {
      departmentContextKeyRef.current = "";
      setRootDir(currentLocalFolder);
    }
  }, [currentLocalFolder, departmentContextKeyRef, rootDir]);

  /* ── AI 사진 분류 2.0 — Step0의 "AI 자동 분류" 탭 상태(기존 필드 분류 엔진은 그대로,
     이 상태들은 그 엔진에 넘길 동적 weights/threshold만 들고 있다) ── */
  const [classificationUiMode, setClassificationUiMode] = useState<ClassificationUiMode>("ai-auto");
  const [aiWeightProfile,      setAiWeightProfile]      = useState<SceneWeightProfile | null>(null);
  const [aiShootingPattern,    setAiShootingPattern]    = useState<FolderShootingPattern | null>(null);
  const [aiAnalyzing,          setAiAnalyzing]          = useState(false);
  const [aiRefining,           setAiRefining]           = useState(false);
  const [aiRefinementHistory,  setAiRefinementHistory]  = useState<string[]>([]);
  const [aiSceneProposals,     setAiSceneProposals]     = useState<SceneProposal[]>([]);
  const [aiScanFileCount,      setAiScanFileCount]      = useState(0);
  // NL 재조정 시 폴더를 다시 스캔하지 않고 미리보기만 재계산하기 위한 스캔 결과 캐시(ref라 리렌더 유발 안 함)
  const aiScanEntriesRef = useRef<{ name: string; mtime: number; file: File }[]>([]);
  /* ── studio state ── */
  const [studioOpts,          setStudioOpts]          = useState<StudioOptions>({ lightingSensitivity:"medium" });
  const [studioFileMode,      setStudioFileMode]      = useState<"copy"|"move">("copy");
  const [studioFiles,         setStudioFiles]         = useState<StudioPhotoFile[]>([]);
  const [studioGroups,        setStudioGroups]        = useState<StudioGroup[]>([]);
  const [studioRawCount,      setStudioRawCount]      = useState(0);
  const [studioCopyLog,       setStudioCopyLog]       = useState<string[]>([]);
  const [studioStats,         setStudioStats]         = useState<StudioStats | null>(null);
  const [activeGroup,         setActiveGroup]         = useState(0);
  const [studioSubMode,       setStudioSubMode]       = useState<StudioSubMode>("concept");
  const [studioGroupSortMode, setStudioGroupSortMode] = useState<StudioGroupSortMode>("gap_ai");
  const [studioGapMinutes,    setStudioGapMinutes]    = useState(3);
  const [personGroups,   setPersonGroups]   = useState<PersonGroup[]>([]);
  const [activePersonGroup, setActivePersonGroup] = useState(0);
  const {
    active: remotePhotoSortActive,
    clearError: clearRemotePhotoSortError,
    error: remotePhotoSortError,
    reportError: reportRemotePhotoSortError,
    submit: handleRemotePhotoSort,
    submitting: remotePhotoSortSubmitting,
  } = useRemotePhotoSortSubmission({
    sourceFolder: remoteSelection?.path,
    shootingMode: photoMode,
    department,
    studioGapMinutes,
    fieldGapMinutes: gapMinutes,
    classificationUiMode,
    fastAnalyzeMode,
    departmentLogicEnabled,
    aiNamingEnabled,
    qualityAnalysisEnabled,
    profileClassificationEnabled,
    departmentResolved: photoDepartmentResolution.status === "resolved",
    workerOffline: remoteWorkerOffline,
    workFolderState: remoteWorkFolderCheck,
    workFolderReady: remoteWorkFolderReady,
    jobActive: remoteJobActive,
    onDepartmentRequired: requestDepartmentPicker,
    onJobCreated: trackRemoteJob,
  });
  const {
    clearSavedSession: clearSession,
    dismissSavedSession,
    savedSession,
  } = usePhotoSortingSession({
    step,
    rootDirName: rootDir?.name ?? "",
    department,
    gapMinutes,
    fastAnalyzeMode,
    departmentLogicEnabled,
    aiNamingEnabled,
    qualityAnalysisEnabled,
    profileClassificationEnabled,
    rawSelectMode,
    fieldRawCount,
    fieldStats,
    classificationJobState,
    boundaryDecisions,
    sceneCorrections,
    fieldScenes,
  });

  const handleRestore = async (saved: SavedSortingSession) => {
    try {
      const h = await pickPhotoFolder("readwrite");
      if (!h) return;
      const restored = await restoreSortingSession(h, saved);

      departmentContextKeyRef.current = `${clientId}:${workflowRunId}:${h.name}`;
      setCurrentLocalFolder(h);
      setRootDir(h);
      setDepartment(saved.department);
      setPhotoDepartmentResolution(resolvePhotoDepartmentEvidence([{
        department: saved.department,
        rawValue: DEPARTMENT_DISPLAY[saved.department],
        source: "saved_session",
      }]));
      setDepartmentPickerOpen(false);
      setGapMinutes(saved.gapMinutes);
      setFastAnalyzeMode(saved.fastAnalyzeMode);
      setDepartmentLogicEnabled(saved.departmentLogicEnabled);
      setAiNamingEnabled(saved.aiNamingEnabled);
      setQualityAnalysisEnabled(saved.qualityAnalysisEnabled);
      setProfileClassificationEnabled(saved.profileClassificationEnabled);
      setRawSelectMode(saved.rawSelectMode);
      setFieldRawCount(saved.fieldRawCount);
      setClassificationJobState(saved.classificationJobState ?? "WAITING_REVIEW");
      setBoundaryDecisions(saved.boundaryDecisions ?? []);
      setSceneCorrections(saved.sceneCorrections ?? []);
      setFieldStats(saved.fieldStats);

      if (restored.kind === "moved") {
        setFieldJpgBaseDir(restored.jpgBase);
        setFieldScenes(restored.scenes);
      } else if (restored.kind === "unmoved") {
        setFieldRawHandles(restored.rawFiles);
        setFieldRawCount(restored.rawFiles.length);
        setFieldScenes(restored.scenes);
      }
      dismissSavedSession();
      setStep(restored.targetStep);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setDirPickError("이전 작업을 이어서 열지 못했습니다. 같은 폴더가 맞는지 확인 후 다시 시도해주세요.");
    }
  };

  const {
    handleFolderClick,
    handleFolderPointerDown,
    selectRemoteFolder,
  } = usePhotoSortingSourceActions({
    executionMode,
    pickPhotoFolder,
    closePhotoSourcePicker,
    openRemotePhotoSourcePicker,
    selectRemotePhotoSource,
    departmentContextKeyRef,
    setPhotoDepartmentResolution,
    setRootDirectory: setRootDir,
    setDepartmentContextError,
    setDepartmentPickerOpen,
    remoteJobActive,
    clearRemoteJob,
    clearRemotePhotoSortError,
    setDirectoryError: setDirPickError,
  });

  useEffect(() => {
    if (executionMode === "REMOTE_WORKER") {
      setAiShootingPattern(null);
      setAiSceneProposals([]);
      setAiScanFileCount(0);
      aiScanEntriesRef.current = [];
    }
    setDirPickError("");
    departmentContextKeyRef.current = "";
    closePhotoSourcePicker();
  }, [closePhotoSourcePicker, departmentContextKeyRef, executionMode]);

  // AI 사진 분류 2.0 — 폴더를 고르면 실제 정밀 분류(handleFieldSort, Vision 호출 포함)를 돌리기
  // 전에 먼저 가볍게 "이번 촬영엔 뭐가 중요한지" 물어본다. 이미지 전송 없음(메타데이터+이미
  // 캐시된 시각 feature만) — 새 Vision 호출·새 feature 추출 전부 안 함(스펙 §6/§29/§30).
  // 결과(weights/threshold)는 handleFieldSort가 그대로 받아쓸 뿐, 엔진 자체는 그대로다.
  const runAiFolderAnalysis = useCallback(async () => {
    if (!rootDir) return;
    setAiAnalyzing(true);
    setAiShootingPattern(null);
    setAiSceneProposals([]);
    try {
      const result = await analyzeBrowserFieldFolder({
        rootDirectory: rootDir,
        department,
        fallbackGapMinutes: gapMinutes,
      });
      aiScanEntriesRef.current = result.entries;
      setAiScanFileCount(result.entries.length);
      if (!result.pattern) return;
      setAiShootingPattern(result.pattern);
      setAiWeightProfile(result.pattern.profile);
      setAiSceneProposals(result.proposals);
    } catch (error) {
      console.error("[ai-folder-analysis]", error);
    } finally {
      setAiAnalyzing(false);
    }
  }, [rootDir, department, gapMinutes]);

  useEffect(() => {
    if (executionMode !== "LOCAL_DIRECT" || !rootDir || photoMode !== "field" || classificationUiMode !== "ai-auto" || step !== 0 || photoDepartmentResolution.status !== "resolved") return;
    runAiFolderAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionMode, rootDir, photoMode, classificationUiMode, step, photoDepartmentResolution.status]);

  // 자연어 재조정 — 화이트리스트 필드(ClassificationOverrides)만 파싱해 현재 profile에 머지한다
  // (스펙 §20, 임의 코드 실행 없음). Step0에서 아직 분류 전이면 미리보기만 갱신하고, 이미 결과를
  // 검토 중이면(step>=1) handleFieldSort를 다시 돌린다 — 체크포인트 캐시가 이전 AI 분석 결과를
  // weights만 바꿔 재사용하므로(boundary-score.ts) 이 재실행은 새 Vision 호출을 만들지 않는다.
  const submitAiNlRequest = useCallback(async (message: string) => {
    setAiRefining(true);
    try {
      const response = await fetch("/api/photo-classification-nl-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context: aiRefinementHistory.length ? aiRefinementHistory.join(" / ") : undefined }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "요청을 이해하지 못했습니다.");
      const base = aiWeightProfile ?? DEFAULT_WEIGHT_PROFILE;
      const overrides = data.overrides as ClassificationOverrides;
      let next = applyOverrides(base, overrides);
      if (data.granularity === "coarser" || data.granularity === "finer") next = adjustGranularity(next, data.granularity);
      setAiWeightProfile(next);
      setAiRefinementHistory((previous) => [...previous, message]);
      if (aiScanEntriesRef.current.length) {
        setAiSceneProposals(await buildQuickProposals(aiScanEntriesRef.current, next.absoluteTimeGapMinutes ?? gapMinutes));
      }
      if (step >= 1) await handleFieldSort();
    } catch (error) {
      console.error("[ai-nl-override]", error);
    } finally {
      setAiRefining(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiWeightProfile, aiRefinementHistory, gapMinutes, step]);

  const stepLabels = photoMode === "studio"
    ? (studioSubMode === "group" ? STUDIO_GROUP_STEPS : STUDIO_STEPS)
    : FIELD_STEPS;

  const runSceneAiAnalysis = useCallback(async (scenes: FieldScene[]) => {
    const result = await runFieldSceneAiAnalysis({
      scenes,
      department,
      departmentLogicEnabled,
      aiNamingEnabled,
      onProgress: setFieldScenes,
    });
    if (result.mergeCandidates) {
      setMergeCandidates(result.mergeCandidates);
      setDismissedCandidates(new Set());
      setMergeDecisions([]);
    }
  }, [aiNamingEnabled, department, departmentLogicEnabled]);

  /* ════════════════════════════════════════════
     FIELD-MODE HANDLERS
  ═══════════════════════════════════════════ */
  const handleFieldSort = useCallback(async () => {
    if (!rootDir) return;
    if (photoDepartmentResolution.status !== "resolved") {
      setDirPickError("진료과를 확인해야 분류를 시작할 수 있습니다.");
      setDepartmentPickerOpen(true);
      return;
    }
    setBridgePlanSummary(null);
    setStep(1); cancelRef.current = false; setCopyLog([]); setBoundaryDecisions([]); setSceneCorrections([]);
    try {
    useBackgroundJobsStore.getState().startJob({
      id: PHOTO_CLASSIFY_JOB_ID, label: "사진 분류 중",
      cur: 0, total: 0, status: "running",
      returnPath: "/photo-sorting?mode=classification", cancelRef,
    });
    classificationAbortRef.current?.abort();
    const abortController = new AbortController();
    classificationAbortRef.current = abortController;
    const classification = await runBrowserFieldClassification({
      rootDirectory: rootDir,
      department,
      gapMinutes,
      fastAnalyzeMode,
      aiNamingEnabled,
      departmentLogicEnabled,
      weightProfile: aiWeightProfile,
      signal: abortController.signal,
      isCancelled: () => cancelRef.current,
      onStateChange: setClassificationJobState,
      onProgress: setProgress,
      onFilesScanned: (rawFiles) => {
        setFieldRawCount(rawFiles.length);
        setFieldRawHandles(rawFiles);
      },
    });
    setBoundaryDecisions(classification.boundaryDecisions);
    setCopyLog(classification.logs);
    if (classification.status === "cancelled") {
      useBackgroundJobsStore.getState().finishJob(PHOTO_CLASSIFY_JOB_ID, "cancelled");
      return;
    }
    const newScenes = classification.scenes;
    const total = classification.total;

    setFieldScenes(newScenes);
    setStep(2);
    useBackgroundJobsStore.getState().finishJob(PHOTO_CLASSIFY_JOB_ID, "done");

    // PHASE 4(2026-08-30) — 채팅/OS 창에서 시작했을 때만(isModal || isEmbedded) 결과 요약을
    // 채팅에 남긴다. 실제 newScenes/jpgEntries 결과가 나온 뒤에만 부르므로 "성공했다"는 거짓
    // 보고가 아니다(스펙 §44).
    if (isModal || isEmbedded) {
      const needsReviewCount = newScenes.filter((scene) => scene.boundaryBefore?.needsReview).length;
      const summary = `사진 분류 완료\n\n총 사진 ${total}장\n분류 Scene ${newScenes.length}개${needsReviewCount > 0 ? `\n확인 필요 ${needsReviewCount}개` : ""}`;
      useOliviaConversationStore.getState().appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: summary,
        blocks: [{ type: "text", text: summary }],
        createdAt: new Date().toISOString(),
        status: "complete",
      });
    }

    // ⑤ 백그라운드: AI 씬 분석 (옵션)
    // 피부과 기본 Naming은 AI 씬 이름 추천 토글과 별개다. 이 토글은 고급 보정만 제어하고,
    // 장비·핸드피스·시술 행동으로 이름을 붙이는 기본 단계는 항상 실행한다.
    if (newScenes.length > 0 && (
      (fastAnalyzeMode && (aiNamingEnabled || departmentLogicEnabled))
      || (department === "dermatology" && departmentLogicEnabled)
    )) {
      runSceneAiAnalysis(newScenes);
    }
    } catch (error) {
      // 2026-09-10 수정 지시서 3번 — 이 함수는 최상위 try/catch가 없어서, 폴더 핸들 획득 실패
      // 등으로 예외가 나면 진행률 화면만 뜬 채 아무 반응도 없이 멈췄다(에러도 안 보이고 재시도도
      // 못 함). 실패를 명확히 보여주고 재시도할 수 있는 상태로 되돌린다.
      const message = error instanceof Error ? error.message : String(error);
      setCopyLog((previous) => [...previous, `❌ 오류: 사진 분류를 진행하지 못했습니다 — ${message}`]);
      setClassificationJobState("WAITING_REVIEW");
      useBackgroundJobsStore.getState().finishJob(PHOTO_CLASSIFY_JOB_ID, "error");
    }
  }, [rootDir, gapMinutes, aiNamingEnabled, departmentLogicEnabled, department, fastAnalyzeMode, isModal, isEmbedded, aiWeightProfile, photoDepartmentResolution.status, runSceneAiAnalysis, setDepartmentPickerOpen, setProgress]);

  useEffect(() => {
    if (!isEmbedded || executionMode !== "LOCAL_DIRECT" || !pendingBridgeClassificationPlan) return;
    const plan = takeBridgeClassificationPlan();
    if (!plan) return;

    setBridgePlanSummary(null);
    setDirPickError("");
    setPhotoMode("field");
    setFastAnalyzeMode(false);
    dismissSavedSession();
    setStep(1);
    setProgress({ cur: 0, total: plan.files.length, msg: "Bridge Scene 계획 확인 중..." });
    setClassificationJobState("CREATING_SCENES");

    void (async () => {
      try {
        const prepared = await prepareBridgeClassificationPlan({ currentLocalFolder, plan });
        departmentContextKeyRef.current = `${clientId}:${workflowRunId}:${plan.directory.name}`;
        setCurrentLocalFolder(plan.directory);
        setDepartment(plan.departmentResolution.department);
        setPhotoDepartmentResolution(plan.departmentResolution);
        setDepartmentContextError("");
        setDepartmentPickerOpen(false);
        setRootDir(plan.directory);
        setFieldJpgBaseDir(null);
        setFieldRawHandles(prepared.rawFiles);
        setFieldRawCount(prepared.rawFiles.length);
        setBoundaryDecisions(plan.boundaries);
        setSceneCorrections([]);
        setMergeCandidates([]);
        setDismissedCandidates(new Set());
        setMergeDecisions([]);
        setFieldScenes(prepared.scenes);
        setFieldStats(prepared.stats);
        setCopyLog(prepared.copyLog);
        setProgress({ cur: plan.files.length, total: plan.files.length, msg: "Bridge Scene 계획 적용 완료" });
        setClassificationJobState("WAITING_REVIEW");
        setBridgePlanSummary(prepared.summary);
        setStep(2);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Bridge Scene 계획을 적용하지 못했습니다.";
        setBridgePlanSummary(null);
        setFieldScenes([]);
        setBoundaryDecisions([]);
        setFieldRawHandles([]);
        setFieldRawCount(0);
        setFieldStats(null);
        setCopyLog([`❌ ${message}`]);
        setClassificationJobState("FAILED");
        setDirPickError(message);
        setRootDir(plan.directory);
        setStep(0);
      }
    })();
  }, [
    currentLocalFolder,
    clientId,
    departmentContextKeyRef,
    dismissSavedSession,
    executionMode,
    isEmbedded,
    pendingBridgeClassificationPlan,
    setCurrentLocalFolder,
    setDepartmentContextError,
    setDepartmentPickerOpen,
    setProgress,
    setPhotoDepartmentResolution,
    takeBridgeClassificationPlan,
    workflowRunId,
  ]);

  const {
    approveAllScenes: approveAllFieldScenes,
    approveScene: approveFieldScene,
    commitSceneName: commitFieldSceneName,
    dismissMergeCandidate: dismissFieldMergeCandidate,
    mergeScenes: mergeFieldScenes,
    splitScene: splitFieldScene,
    updateSceneName: updateFieldSceneName,
    updateSplitPosition,
  } = useFieldSceneReviewActions({
    actionsEnabled: isModal || isEmbedded,
    rootDirectory: rootDir,
    jpgBaseDirectory: fieldJpgBaseDir,
    scenes: fieldScenes,
    mergeCandidates,
    setScenes: setFieldScenes,
    setBoundaryDecisions,
    setSceneCorrections,
    setDismissedCandidates,
    setMergeDecisions,
    setSplitPositions,
    startClassification: handleFieldSort,
    submitNaturalLanguageRequest: submitAiNlRequest,
  });

  const handleConfirmScenes = useCallback(async () => {
    if (!rootDir) return;
    setStep(3);
    setClassificationJobState("APPROVED");
    try {
      setProgress({ cur:0, total:0, msg:"폴더 정리 중..." });
      const result = await runBrowserFieldReviewConfirmation({
        rootDirectory: rootDir,
        scenes: fieldScenes,
        jpgBaseDirectory: fieldJpgBaseDir,
        rawFiles: fieldRawHandles,
        rawCount: fieldRawCount,
        fastAnalyzeMode,
        qualityAnalysisEnabled,
        profileClassificationEnabled,
        boundaryDecisions,
        sceneCorrections,
        accuracyReport,
        mergeCandidates,
        mergeDecisions,
        department,
        departmentDisplayName: DEPARTMENT_DISPLAY[department],
        gapMinutes,
        departmentLogicEnabled,
        aiNamingEnabled,
        rawSelectMode,
        isCancelled: () => cancelRef.current,
        onOutputProgress: ({ completed, total, message }) => setProgress({ cur: completed, total, msg: message }),
        onSecondaryProgress: ({ current, total, fileName }) => setProgress({ cur: current, total, msg: `분석: ${fileName}` }),
        onScenesUpdated: setFieldScenes,
      });
      setFieldJpgBaseDir(result.jpgBaseDirectory);
      setFieldScenes(result.scenes);
      setFieldStats(result.stats);
      setStep(4);
    } catch (error) {
      // 2026-09-10 수정 지시서 3번 — "완료"(폴더 정리 실행) 버튼 핸들러에 최상위 try/catch가
      // 없어서, 폴더 핸들 획득 실패(권한 만료 등) 시 진행률 화면만 뜬 채 멈췄다. 일부 파일은
      // 이미 이동됐을 수 있어(REPORT/file_operation_journal.json에 기록됨) 씬 검토로 되돌리고
      // 그 사실을 안내한다.
      const message = error instanceof Error ? error.message : String(error);
      setCopyLog((previous) => [...previous, `❌ 오류: 폴더 정리를 완료하지 못했습니다 — ${message}`, "일부 파일은 이미 이동됐을 수 있어요 — REPORT 폴더의 file_operation_journal.json을 확인해주세요."]);
      setStep(2);
      setClassificationJobState("WAITING_REVIEW");
    }
  }, [fieldScenes, fieldJpgBaseDir, fieldRawHandles, qualityAnalysisEnabled, profileClassificationEnabled, fieldRawCount, fastAnalyzeMode, rootDir, boundaryDecisions, sceneCorrections, accuracyReport, mergeCandidates, mergeDecisions, department, gapMinutes, departmentLogicEnabled, aiNamingEnabled, rawSelectMode, setProgress]);

  /* ════════════════════════════════════════════
     STUDIO-MODE HANDLERS
  ═══════════════════════════════════════════ */
  const handleStudioSort = useCallback(async () => {
    if (!rootDir) return;
    setStep(1); cancelRef.current = false;
    setProgress({ cur:0, total:0, msg:"폴더 스캔 중..." });
    try {
      const result = await runBrowserStudioClassification({
        rootDirectory: rootDir,
        subMode: studioSubMode,
        groupSortMode: studioGroupSortMode,
        gapMinutes: studioGapMinutes,
        lightingSensitivity: studioOpts.lightingSensitivity,
        onProgress: setProgress,
        onFilesScanned: (files, rawCount) => {
          setStudioRawCount(rawCount);
          setStudioFiles(files);
          setStep(2);
        },
        onFilesChange: setStudioFiles,
      });
      setStudioFiles(result.files);
      setStudioGroups(result.conceptGroups);
      setPersonGroups(result.personGroups);
      setStep(3);
      if (isModal || isEmbedded) {
        const summary = `사진 분류 완료\n\n총 사진 ${result.total}장`;
        useOliviaConversationStore.getState().appendMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: summary,
          blocks: [{ type: "text", text: summary }],
          createdAt: new Date().toISOString(),
          status: "complete",
        });
      }
    } catch (error) {
      // 2026-09-10 수정 지시서 3번 — 스튜디오 모드도 같은 패턴(최상위 try/catch 없음)이라
      // 동일하게 고친다.
      const message = error instanceof Error ? error.message : String(error);
      setStudioCopyLog((previous) => [...previous, `❌ 오류: 파일 분류를 진행하지 못했습니다 — ${message}`]);
      setStep(0);
    }
  }, [rootDir, studioOpts.lightingSensitivity, studioSubMode, studioGroupSortMode, studioGapMinutes, isModal, isEmbedded, setProgress]);

  // PHASE 4(채팅 핸드오프, 2026-08-30) — 채팅에서 설정을 다 모으고 [사진 분류 시작]을 누르면
  // usePhotoClassificationHandoffStore에 값이 실려 오고 이 Workspace가 열린다. 마운트 시 한 번
  // 그 값으로 로컬 state를 채우고, rootDir가 실제로 반영된 다음 렌더에서 handleFieldSort/
  // handleStudioSort를 "페이지 버튼을 누른 것과 동일하게" 호출한다 — 별도 실행 경로를
  // 만들지 않는다. setRootDir 직후 같은 tick에서 바로 호출하면 handleFieldSort/handleStudioSort
  // 클로저가 아직 이전(null) rootDir를 참조하므로, rootDir가 반영된 다음 렌더를 기다린다.
  const handoffPendingRef = useRef(false);
  useEffect(() => {
    if (!isModal) return;
    const handoff = usePhotoClassificationHandoffStore.getState().consume();
    if (!handoff?.rootDir) return;
    setPhotoMode(handoff.photoMode);
    departmentContextKeyRef.current = `${clientId}:${workflowRunId}:${handoff.rootDir.name}`;
    setCurrentLocalFolder(handoff.rootDir);
    setRootDir(handoff.rootDir);
    if (handoff.photoMode === "field") {
      if (handoff.department) {
        setDepartment(handoff.department);
        setPhotoDepartmentResolution(handoff.departmentResolution ?? manualPhotoDepartmentResolution(handoff.department));
        setDepartmentPickerOpen(false);
      }
      if (handoff.gapMinutes != null) setGapMinutes(handoff.gapMinutes);
      if (handoff.fastAnalyzeMode != null) setFastAnalyzeMode(handoff.fastAnalyzeMode);
      if (handoff.departmentLogicEnabled != null) setDepartmentLogicEnabled(handoff.departmentLogicEnabled);
      if (handoff.aiNamingEnabled != null) setAiNamingEnabled(handoff.aiNamingEnabled);
      if (handoff.qualityAnalysisEnabled != null) setQualityAnalysisEnabled(handoff.qualityAnalysisEnabled);
      if (handoff.profileClassificationEnabled != null) setProfileClassificationEnabled(handoff.profileClassificationEnabled);
    } else {
      if (handoff.lightingSensitivity) setStudioOpts((o) => ({ ...o, lightingSensitivity: handoff.lightingSensitivity! }));
      if (handoff.studioSubMode) setStudioSubMode(handoff.studioSubMode);
    }
    handoffPendingRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal]);

  useEffect(() => {
    if (!handoffPendingRef.current || !rootDir) return;
    handoffPendingRef.current = false;
    // handleFieldSort/handleStudioSort 내부의 개별 단계는 각자 로컬 try/catch로 대체값 처리를
    // 하지만(체크포인트 복구), 폴더 접근 권한 상실처럼 그 전체를 깨는 예외는 여기서만 잡힌다 —
    // 이 경우에만 "성공했다"는 오해가 안 생기게 실패를 채팅에 알린다(스펙 §37, §44).
    const run = photoMode === "field" ? handleFieldSort() : handleStudioSort();
    run.catch((error) => {
      const message = error instanceof Error ? error.message : "사진 분류 중 오류가 발생했습니다.";
      useOliviaConversationStore.getState().appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `사진 분류 중 오류가 발생했습니다. (${message})`,
        blocks: [{ type: "text", text: `사진 분류 중 오류가 발생했습니다. (${message})` }],
        createdAt: new Date().toISOString(),
        status: "complete",
      });
    });
  }, [rootDir, photoMode, handleFieldSort, handleStudioSort]);

  const runStudioOutput = useCallback(async () => {
    if (!rootDir || (studioSubMode === "group" ? personGroups.length === 0 : studioGroups.length === 0)) return;
    setStep(5); cancelRef.current = false;
    try {
      const stats = await runBrowserStudioOutput({
        rootDirectory: rootDir,
        subMode: studioSubMode,
        personGroups,
        conceptGroups: studioGroups,
        totalJpg: studioFiles.length,
        totalRaw: studioRawCount,
        fileMode: studioFileMode,
        isCancelled: () => cancelRef.current,
        onProgress: setProgress,
        onLog: setStudioCopyLog,
      });
      setStudioStats(stats);
      setStep(6);
    } catch (error) {
      // 2026-09-10 수정 지시서 3번
      const message = error instanceof Error ? error.message : String(error);
      setStudioCopyLog((previous) => [...previous, `❌ 오류: 파일 정리를 완료하지 못했습니다 — ${message}`]);
      setStep(4);
    }
  }, [rootDir, studioSubMode, personGroups, studioGroups, studioFiles.length, studioRawCount, studioFileMode, setProgress]);

  const renderPhotoSourceControl = (emptyLabel: string) => (
    <PhotoSourceControl
      emptyLabel={emptyLabel}
      executionMode={executionMode}
      localFolderName={rootDir?.name ?? null}
      remoteSelection={remoteSelection}
      workFolderState={remoteWorkFolderCheck}
      onRetryWorkFolder={(sourceFolder) => void requestRemoteWorkFolderCheck(sourceFolder)}
      workerOffline={remoteWorkerOffline}
      sortActive={remotePhotoSortActive}
      sortSubmitting={remotePhotoSortSubmitting}
      remoteJobActive={remoteJobActive}
      remoteJob={remotePhotoSortJob}
      pollingState={remotePollingState}
      pollingMessage={remotePollingMessage}
      sortError={remotePhotoSortError}
      onCancelRemoteJob={() => {
        void cancelRemoteJob().catch((error) => {
          reportRemotePhotoSortError(error, "작업 취소 요청을 보내지 못했습니다.");
        });
      }}
      onFolderPointerDown={handleFolderPointerDown}
      onFolderClick={handleFolderClick}
      folderError={dirPickError}
    />
  );

  const renderDepartmentControl = (compact = false) => (
    <PhotoDepartmentControl
      compact={compact}
      hasFolder={executionMode === "LOCAL_DIRECT" ? Boolean(rootDir) : Boolean(remoteSelection?.path)}
      loading={departmentContextLoading}
      resolution={photoDepartmentResolution}
      pickerOpen={departmentPickerOpen}
      error={departmentContextError}
      onOpenPicker={() => setDepartmentPickerOpen(true)}
      onChoose={chooseFieldDepartment}
    />
  );

  /* ════════════════════════════════════════════
     STEP 0 — 설정 (FIELD)
  ═══════════════════════════════════════════ */
  const departmentReady = photoDepartmentResolution.status === "resolved";
  const setupView = (
    <PhotoSortingSetupView
        savedSession={savedSession}
        showSavedSession={photoSourceSurface === "desktop"}
        onRestoreSession={(session) => void handleRestore(session)}
        onClearSession={clearSession}
        photoMode={photoMode}
        onPhotoModeChange={setPhotoMode}
        showBrowserWarning={executionMode === "LOCAL_DIRECT" && photoSourceSurface === "desktop" && !hasFS}
        field={{
          classificationMode: classificationUiMode,
          onClassificationModeChange: setClassificationUiMode,
          sourceControl: renderPhotoSourceControl("RAW+JPG 혼합 폴더 선택"),
          departmentControl: renderDepartmentControl(),
          compactDepartmentControl: renderDepartmentControl(true),
          prompt: <ClassificationPrompt onSubmit={submitAiNlRequest} busy={aiRefining} history={aiRefinementHistory} />,
          analysisSummary: <FolderAnalysisSummary analyzing={aiAnalyzing} pattern={aiShootingPattern} fileCount={aiScanFileCount} />,
          sceneProposals: <SceneProposalList proposals={aiSceneProposals} />,
          classificationProfile: <ClassificationProfilePanel profile={aiWeightProfile} onOpenAdvanced={() => setClassificationUiMode("advanced")} />,
          advancedSettings: (
            <FieldClassificationSettings
              gapMinutes={gapMinutes}
              onGapMinutesChange={setGapMinutes}
              fastAnalyzeMode={fastAnalyzeMode}
              onFastAnalyzeModeChange={setFastAnalyzeMode}
              departmentLogicEnabled={departmentLogicEnabled}
              onDepartmentLogicEnabledChange={setDepartmentLogicEnabled}
              aiNamingEnabled={aiNamingEnabled}
              onAiNamingEnabledChange={setAiNamingEnabled}
              qualityAnalysisEnabled={qualityAnalysisEnabled}
              onQualityAnalysisEnabledChange={setQualityAnalysisEnabled}
              profileClassificationEnabled={profileClassificationEnabled}
              onProfileClassificationEnabledChange={setProfileClassificationEnabled}
            />
          ),
          autoStart: {
            onStart: executionMode === "LOCAL_DIRECT" ? handleFieldSort : handleRemotePhotoSort,
            disabled: executionMode === "LOCAL_DIRECT" ? (!rootDir || !hasFS || aiAnalyzing || !departmentReady) : (!remoteSelection?.path || !remoteWorkFolderReady || remotePhotoSortActive || remoteWorkerOffline || !departmentReady),
            label: executionMode === "REMOTE_WORKER" ? "Mac Studio에서 AI 자동 분류 시작" : "AI 자동 분류 시작",
          },
          advancedStart: {
            onStart: executionMode === "LOCAL_DIRECT" ? handleFieldSort : handleRemotePhotoSort,
            disabled: executionMode === "LOCAL_DIRECT" ? (!rootDir || !hasFS || !departmentReady) : (!remoteSelection?.path || !remoteWorkFolderReady || remotePhotoSortActive || remoteWorkerOffline || !departmentReady),
            label: executionMode === "REMOTE_WORKER" ? "Mac Studio에서 AI 자동 분류 시작" : "현장촬영 분류 시작",
          },
          hasSource: Boolean(rootDir) || Boolean(remoteSelection?.path),
          departmentReady,
        }}
        studio={{
          settings: (
            <StudioClassificationSettings
              subMode={studioSubMode}
              onSubModeChange={setStudioSubMode}
              groupSortMode={studioGroupSortMode}
              onGroupSortModeChange={setStudioGroupSortMode}
              gapMinutes={studioGapMinutes}
              onGapMinutesChange={setStudioGapMinutes}
              sourceControl={renderPhotoSourceControl("RAW+JPG 혼합 백업 폴더 선택")}
              lightingSensitivity={studioOpts.lightingSensitivity}
              onLightingSensitivityChange={(value) => setStudioOpts((current) => ({ ...current, lightingSensitivity: value }))}
              fileMode={studioFileMode}
              onFileModeChange={setStudioFileMode}
            />
          ),
          start: {
            onStart: executionMode === "LOCAL_DIRECT" ? handleStudioSort : handleRemotePhotoSort,
            disabled: executionMode === "LOCAL_DIRECT" ? (!rootDir || !hasFS) : (!remoteSelection?.path || !remoteWorkFolderReady || remotePhotoSortActive || remoteWorkerOffline),
            label: executionMode === "REMOTE_WORKER" ? "Mac Studio에서 AI 자동 분류 시작" : "스튜디오 분류 시작",
          },
        }}
    />
  );

  /* ════════════════════════════════════════════
     FIELD STEPS
  ═══════════════════════════════════════════ */
  const fieldCompleteView = fieldStats ? (
    <FieldClassificationCompleteView
        stats={([
          { label: "씬", value: fieldStats.totalScenes, color: C.teal },
          { label: "전체 JPG", value: fieldStats.totalJpg, color: C.txt },
          { label: "프로필", value: fieldStats.totalProfile, color: C.purple },
        ] as { label: string; value: number; color: string }[]).concat(
          fieldStats.totalQualityReject > 0
            ? [{ label: "품질 제외", value: fieldStats.totalQualityReject, color: C.red }]
            : [],
        )}
        onReview={() => setStep(2)}
        onOpenPhotoSelect={onOpenPhotoSelect}
    />
  ) : null;

  /* ════════════════════════════════════════════
     STUDIO STEPS
  ═══════════════════════════════════════════ */
  const updateStudioGroupFolderName = useCallback((groupId: string, value: string) => {
    setStudioGroups((current) => current.map((group) => (
      group.key === groupId ? { ...group, editedFolderName: value } : group
    )));
  }, []);

  const updatePersonGroupFolderName = useCallback((groupId: string, value: string) => {
    setPersonGroups((current) => current.map((group) => (
      group.id === groupId ? { ...group, editedFolderName: value } : group
    )));
  }, []);

  const resetStudioClassification = useCallback(() => {
    setStep(0);
    setStudioFiles([]);
    setStudioGroups([]);
    setPersonGroups([]);
    setRootDir(null);
    setStudioRawCount(0);
    setStudioCopyLog([]);
    setStudioStats(null);
  }, []);

  /* ════════════════════════════════════════════
     LAYOUT
  ═══════════════════════════════════════════ */
  return (
    <div>
      <PhotoSortingWorkspaceShell
        embedded={isEmbedded}
        modal={isModal}
        step={step}
        stepLabels={stepLabels}
        photoMode={photoMode}
        studioSubMode={studioSubMode}
        department={department}
        gapMinutes={gapMinutes}
        rootFolderName={rootDir?.name ?? ""}
      >
        {step===0 && setupView}

        {photoMode==="field" && step===1 && (
          <FieldAnalysisProgressStep
            fastAnalyzeMode={fastAnalyzeMode}
            progress={progress}
            classificationJobState={classificationJobState}
            copyLog={copyLog}
            onCancel={() => {
              cancelRef.current = true;
              classificationAbortRef.current?.abort();
              setClassificationJobState("CANCELLED");
            }}
          />
        )}
        {photoMode==="field" && step===2 && (
          <FieldSceneReviewStep
            scenes={fieldScenes}
            rawCount={fieldRawCount}
            departmentLabel={DEPARTMENT_DISPLAY[department]}
            bridgePlanSummary={bridgePlanSummary}
            fastAnalyzeMode={fastAnalyzeMode}
            boundaryDecisions={boundaryDecisions}
            aiAnalysisEnabled={aiNamingEnabled || departmentLogicEnabled}
            evaluationMode={evaluationMode}
            onEvaluationModeChange={setEvaluationMode}
            groundTruthSelection={groundTruthSelection}
            onGroundTruthSelectionChange={setGroundTruthSelection}
            groundTruthBoundaries={groundTruthBoundaries}
            onGroundTruthBoundariesChange={setGroundTruthBoundaries}
            accuracyReport={accuracyReport}
            onAccuracyReportChange={setAccuracyReport}
            mergeCandidates={mergeCandidates}
            dismissedCandidates={dismissedCandidates}
            splitPositions={splitPositions}
            onApproveAll={approveAllFieldScenes}
            onSceneNameChange={updateFieldSceneName}
            onSceneNameCommit={commitFieldSceneName}
            onSuggestedNameApply={updateFieldSceneName}
            onSplitPositionChange={updateSplitPosition}
            onSplitScene={splitFieldScene}
            onMergeScenes={(fromIndex, toIndex, candidateId) => void mergeFieldScenes(fromIndex, toIndex, candidateId)}
            onApproveScene={approveFieldScene}
            onDismissCandidate={dismissFieldMergeCandidate}
            onBack={() => setStep(0)}
            onConfirm={handleConfirmScenes}
          />
        )}
        {photoMode==="field" && step===3 && (
          <FieldOutputProgressStep
            fastAnalyzeMode={fastAnalyzeMode}
            progress={progress}
            qualityAnalysisEnabled={qualityAnalysisEnabled}
            profileClassificationEnabled={profileClassificationEnabled}
            onCancel={() => { cancelRef.current = true; }}
          />
        )}
        {photoMode==="field" && step===4 && fieldCompleteView}

        {photoMode==="studio" && step===1 && <StudioFileScanProgressStep progress={progress} />}
        {photoMode==="studio" && step===2 && <StudioPhotoAnalysisProgressStep progress={progress} studioFiles={studioFiles} studioSubMode={studioSubMode} />}
        {photoMode==="studio" && step===3 && (studioSubMode==="group" ? (
          <StudioPersonEditStep
            groups={personGroups}
            onFolderNameChange={updatePersonGroupFolderName}
            onBack={() => setStep(0)}
            onApprove={() => setStep(4)}
          />
        ) : (
          <StudioConceptEditStep
            groups={studioGroups}
            onFolderNameChange={updateStudioGroupFolderName}
            onBack={() => setStep(0)}
            onApprove={() => setStep(4)}
          />
        ))}
        {photoMode==="studio" && step===4 && (studioSubMode==="group" ? (
          <StudioPersonConfirmationStep
            groups={personGroups}
            activeIndex={activePersonGroup}
            rawCount={studioRawCount}
            onActiveIndexChange={setActivePersonGroup}
            onBack={() => setStep(3)}
            onStart={runStudioOutput}
          />
        ) : (
          <StudioConceptConfirmationStep
            groups={studioGroups}
            activeIndex={activeGroup}
            rawCount={studioRawCount}
            onActiveIndexChange={setActiveGroup}
            onBack={() => setStep(3)}
            onStart={runStudioOutput}
          />
        ))}
        {photoMode==="studio" && step===5 && <StudioOutputProgressStep progress={progress} copyLog={studioCopyLog} />}
        {photoMode==="studio" && step===6 && studioStats && (
          <StudioClassificationCompletionStep
            stats={studioStats}
            subMode={studioSubMode}
            rootFolderName={rootDir?.name ?? ""}
            personGroups={personGroups}
            conceptGroups={studioGroups}
            onReset={resetStudioClassification}
          />
        )}
      </PhotoSortingWorkspaceShell>

      {photoSourcePickerOpen ? (
        <PhotoSourcePicker
          onCancel={closePhotoSourcePicker}
          onSelectRemote={selectRemoteFolder}
        />
      ) : null}
    </div>
  );
}
