"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderTree } from "lucide-react";
import type { FieldScene, FieldStats, MedicalDepartment, SceneFile } from "@/lib/photo-classifier/types";
import { DEPARTMENT_DISPLAY } from "@/lib/photo-classifier/types";
import {
  manualPhotoDepartmentResolution,
  resolvePhotoDepartmentEvidence,
} from "@/lib/photo-classifier/departmentResolver";
import { buildMergeCandidates } from "@/lib/photo-classifier/scene-merge-candidate";
import type { SceneMergeCandidate, MergeDecision } from "@/lib/photo-classifier/scene-merge-types";
import { getClassificationSettings } from "@/lib/photo-classifier/classification-settings";
import { buildCandidateSegments, buildVisualBoundaryCandidates, sortTimestampedFiles } from "@/lib/photo-classifier/candidate-builder";
import { decideBoundary } from "@/lib/photo-classifier/boundary-score";
import { stabilizeBoundaries } from "@/lib/photo-classifier/boundary-stabilizer";
import { buildFieldScenesFromBoundaries } from "@/lib/photo-classifier/scene-builder";
import { extractFeaturesWithWorkers } from "@/lib/photo-classifier/feature-worker-client";
import { buildPurposeSampleIndices, findPurposeTransitions } from "@/lib/photo-classifier/purpose-scan";
import {
  clearClassificationCheckpoint, featureCacheKey, folderFingerprint, getCachedFeature, getCachedPattern,
  getClassificationCheckpoint, setCachedFeature, setCachedPattern, setClassificationCheckpoint,
} from "@/lib/photo-classifier/scene-cache";
import { readPhotoTimestamp } from "@/lib/photo-classifier/timestamp";
import {
  createApproveSceneCorrection,
  createMergeSceneCorrection,
  createRenameSceneCorrection,
  markBoundaryAsManuallyMerged,
  mergePlannedFieldScenes,
  splitPlannedFieldScene,
} from "@/lib/photo-classifier/sceneReviewEdits";
import { usePhotoClassificationHandoffStore } from "@/lib/store/usePhotoClassificationHandoffStore";
import { usePhotoClassificationActionsStore } from "@/lib/store/usePhotoClassificationActionsStore";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import type {
  AccuracyReport, ClassificationJobState, HybridSceneType, LocalVisualFeatures, SceneBoundaryDecision,
  SceneCorrection, SceneFrameAnalysis, TimestampSource,
} from "@/lib/photo-classifier/hybrid-types";
import {
  applyOverrides, adjustGranularity, computeFolderStats,
  DEFAULT_WEIGHT_PROFILE,
  type FolderShootingPattern, type SceneWeightProfile, type SceneProposal, type ClassificationOverrides,
} from "@/lib/photo-classifier/pattern-analysis";
import ClassificationModeToggle, { type ClassificationUiMode } from "./ai-auto/ClassificationModeToggle";
import FolderAnalysisSummary from "./ai-auto/FolderAnalysisSummary";
import ClassificationPrompt from "./ai-auto/ClassificationPrompt";
import SceneProposalList from "./ai-auto/SceneProposalList";
import ClassificationProfilePanel from "./ai-auto/ClassificationProfilePanel";
import PhotoSourcePicker from "./PhotoSourcePicker";
import { usePhotoSourceSurface } from "./usePhotoSourceSurface";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import { Stepper } from "@/components/workspace-shell/Stepper";
import { PROFILE_EXCLUDED_SCENE_TYPES } from "@/lib/photo-classifier/constants";
import { CAMERA_JPG_EXTENSIONS } from "@/lib/photo/extensions";
import {
  prepareBridgeClassificationPlan,
} from "@/lib/photo-bridge/classificationPlanApply";
import {
  assignStudioPersonGroups,
  buildPersonFeatureTags,
  buildPersonGroups,
  buildStudioGroups,
  computeClothingLabel,
  computeGroupKey,
  groupStudioPhotosByTimeGap,
  normalizePersonFeatures,
  type PersonGroup,
  type StudioGroup,
  type StudioGroupSortMode,
  type StudioInnerWear,
  type StudioLightingStatus,
  type StudioOptions,
  type StudioPhotoFile,
  type StudioPoseType,
  type StudioStats,
  type StudioSubMode,
} from "@/lib/photo-classifier/studioGrouping";
import {
  analyzeJpg,
  buildQuickProposals,
  getApiThumb,
  getBoundaryApiImage,
  getStudioThumb,
  loadThumb,
  mapWithConcurrency,
  quickBrightness,
} from "@/lib/photo-classifier/browserProcessing";
import {
  copyFileHandle,
  renameDirHandle,
  splitRawAndJpg,
  withTimeout,
} from "@/lib/photo-classifier/browserFileOps";
import {
  downloadCSV,
  estimatedRemaining,
  makeCSV,
} from "@/lib/photo-classifier/workspaceFormatting";
import {
  type SavedSortingSession,
} from "@/lib/photo-classifier/sortingSession";
import {
  canRestoreUnmovedSortingSession,
  restoreMovedSortingScenes,
  restoreUnmovedSortingScenes,
} from "@/lib/photo-classifier/sortingSessionRestore";
import {
  Btn,
  C,
  Card,
  ProgressBar,
} from "./PhotoSortingUi";
import { useRemoteWorkFolderCheck } from "./useRemoteWorkFolderCheck";
import { useRemotePhotoSortSubmission } from "./useRemotePhotoSortSubmission";
import { usePhotoDepartmentContext } from "./usePhotoDepartmentContext";
import { useRemotePhotoSourceSelection } from "./useRemotePhotoSourceSelection";
import { usePhotoSortingSession } from "./usePhotoSortingSession";
import { usePhotoClassificationProgress } from "./usePhotoClassificationProgress";
import { PhotoSourceControl } from "./PhotoSourceControl";
import { PhotoDepartmentControl } from "./PhotoDepartmentControl";
import { SavedPhotoSortingSessionBanner } from "./SavedPhotoSortingSessionBanner";
import {
  PhotoShootingModeControl,
  type PhotoShootingMode,
} from "./PhotoShootingModeControl";
import { FieldClassificationSettings } from "./FieldClassificationSettings";
import { StudioClassificationSettings } from "./StudioClassificationSettings";
import { PhotoClassificationProgressView } from "./PhotoClassificationProgressView";
import { FieldSceneReviewOverview } from "./FieldSceneReviewOverview";
import { FieldSceneReviewList } from "./FieldSceneReviewList";
import { StudioGroupEditView } from "./StudioGroupEditView";
import { StudioGroupConfirmationView } from "./StudioGroupConfirmationView";
import { StudioClassificationCompleteView } from "./StudioClassificationCompleteView";
import { FieldClassificationCompleteView } from "./FieldClassificationCompleteView";

/* ════════════════════════════════════════════════
   SHARED TYPES
═══════════════════════════════════════════════ */
type PhotoMode = PhotoShootingMode;

/* ════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const JPG_EXTS = CAMERA_JPG_EXTENSIONS;
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
  // Olivia Chat이 "분류했어요"라고 말해도 되는 시점을 정직하게 판단하려고(스펙 §37/44) fieldScenes를
  // 그대로 미러링한다 — handleFieldSort는 비동기라 await 직후 클로저의 fieldScenes가 아니라
  // 이 ref로 최신 값을 읽어야 한다.
  const fieldScenesRef = useRef<FieldScene[]>([]);
  useEffect(() => { fieldScenesRef.current = fieldScenes; }, [fieldScenes]);

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
      const jpgBase = await (h as FileSystemDirectoryHandle).getDirectoryHandle("JPG").catch(() => null);

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

      // JPG/ 폴더가 있으면 씬까지 복원, 없으면 설정(step 0)으로만 복원
      if (jpgBase) {
        setFieldJpgBaseDir(jpgBase);

        // Reconstruct scenes by re-scanning JPG/SceneXX/ directories
        if (saved.sceneSummary.length > 0) {
          setFieldScenes(await restoreMovedSortingScenes(jpgBase, saved.sceneSummary));
        }

        dismissSavedSession();
        const targetStep = saved.step === 3 ? 2 : saved.step;
        setStep(targetStep);
      } else {
        // v2 정밀 분류는 승인 전 파일을 이동하지 않으므로 원본 폴더에서 Scene 계획을 복원한다.
        if (canRestoreUnmovedSortingSession(saved)) {
          const restored = await restoreUnmovedSortingScenes(h, saved.sceneSummary);
          setFieldRawHandles(restored.rawFiles);
          setFieldRawCount(restored.rawFiles.length);
          setFieldScenes(restored.scenes);
          dismissSavedSession();
          setStep(2);
        } else {
          dismissSavedSession();
          setStep(0);
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setDirPickError("이전 작업을 이어서 열지 못했습니다. 같은 폴더가 맞는지 확인 후 다시 시도해주세요.");
    }
  };

  const pickDir = async () => {
    setDirPickError("");
    const h = await pickPhotoFolder("readwrite");
    if (!h) return;
    departmentContextKeyRef.current = "";
    setPhotoDepartmentResolution({ status: "unknown", evidence: [] });
    setRootDir(h);
    closePhotoSourcePicker();
  };

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

  const openPhotoSourcePicker = () => {
    setDirPickError("");
    openRemotePhotoSourcePicker();
  };

  const selectRemoteFolder = (selection: RemoteNasSelection) => {
    selectRemotePhotoSource(selection);
    departmentContextKeyRef.current = "";
    setPhotoDepartmentResolution({ status: "unknown", evidence: [] });
    setDepartmentContextError("");
    setDepartmentPickerOpen(false);
    if (!remoteJobActive) clearRemoteJob();
    clearRemotePhotoSortError();
    setDirPickError("");
  };

  const handleFolderPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (executionMode === "LOCAL_DIRECT" && event.button === 0) void pickDir();
  };

  const handleFolderClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (executionMode === "REMOTE_WORKER") {
      openPhotoSourcePicker();
      return;
    }
    // Pointer로 연 Finder를 click에서 다시 열지 않고, 키보드 활성화만 보완한다.
    if (event.detail === 0) void pickDir();
  };

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
      const entries: { name: string; mtime: number; file: File }[] = [];
      for await (const [name, handle] of (rootDir as any).entries()) {
        if (handle.kind !== "file") continue;
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        if (!JPG_EXTS.has(ext)) continue;
        const file = await (handle as FileSystemFileHandle).getFile();
        const exif = await readPhotoTimestamp(file);
        entries.push({ name, mtime: exif?.timestamp ?? file.lastModified, file });
      }
      entries.sort((a, b) => a.mtime - b.mtime);
      aiScanEntriesRef.current = entries;
      setAiScanFileCount(entries.length);
      if (!entries.length) return;

      const fingerprint = folderFingerprint(rootDir.name, entries.map((entry) => ({ name: entry.name, size: entry.file.size, lastModified: entry.file.lastModified })));
      const cachedPattern = await getCachedPattern<FolderShootingPattern>(fingerprint);
      if (cachedPattern) {
        setAiShootingPattern(cachedPattern);
        setAiWeightProfile(cachedPattern.profile);
        setAiSceneProposals(await buildQuickProposals(entries, cachedPattern.profile.absoluteTimeGapMinutes ?? gapMinutes));
        return;
      }

      const cachedFeatures = (await Promise.all(
        entries.map((entry) => getCachedFeature(featureCacheKey(rootDir.name, entry.file))),
      )).filter((feature): feature is LocalVisualFeatures => Boolean(feature));
      const stats = computeFolderStats(entries.map((entry) => entry.mtime), cachedFeatures, 1);

      const response = await fetch("/api/photo-classification-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department, stats }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "폴더 분석 실패");
      const pattern = data.pattern as FolderShootingPattern;
      setAiShootingPattern(pattern);
      setAiWeightProfile(pattern.profile);
      await setCachedPattern(fingerprint, pattern);
      setAiSceneProposals(await buildQuickProposals(entries, pattern.profile.absoluteTimeGapMinutes ?? gapMinutes));
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
    // Scene Engine v2 — AI 폴더 분석은 threshold/weight만 조정한다.
    // 60–180초는 mandatory AI, 180초 이상은 가중치와 무관하게 강제 분리한다.
    const effectiveGapMinutes = aiWeightProfile?.absoluteTimeGapMinutes ?? gapMinutes;
    const preciseSettings = {
      ...getClassificationSettings(department === "dermatology" ? "dermatology" : "default", "precise"),
      ...(aiWeightProfile ? { splitThreshold: aiWeightProfile.splitThreshold, reviewThreshold: aiWeightProfile.reviewThreshold } : {}),
    };

    // ① 스캔
    const jpgEntries: { name: string; handle: FileSystemFileHandle; file: File; mtime: number; timestampSource: TimestampSource; warning?: string }[] = [];
    setClassificationJobState("SCANNING_FILES");
    setProgress({ cur:0, total:0, msg:"폴더 스캔 중..." });
    let lastUpdate = Date.now();

    const { rawFiles, jpgFiles } = await splitRawAndJpg(rootDir);
    for (const entry of jpgFiles) {
      // Scene Engine v1: 빠른 모드도 capture ordering만큼은 EXIF
      // DateTimeOriginal을 우선한다. 빠른 모드는 이후의 시각/AI 분석만 줄인다.
      setClassificationJobState("READING_EXIF");
      const exif = await readPhotoTimestamp(entry.file);
      jpgEntries.push({
        name: entry.name,
        handle: entry.handle,
        file: entry.file,
        mtime: exif?.timestamp ?? entry.mtime,
        timestampSource: exif?.source ?? "mtime",
        warning: exif ? undefined : "EXIF 촬영시간 없음 — mtime 사용",
      });
      if (Date.now() - lastUpdate > 300) {
        setProgress({ cur:0, total:0, msg:`스캔: ${entry.name}` });
        lastUpdate = Date.now();
      }
    }
    setFieldRawCount(rawFiles.length);
    setFieldRawHandles(rawFiles);

    // ③ JPG → 시간순 정렬 → Scene 분리
    const sortedEntries = sortTimestampedFiles(jpgEntries);
    jpgEntries.splice(0, jpgEntries.length, ...sortedEntries);
    const gapMs = Math.max(5, effectiveGapMinutes) * 60 * 1000;
    const groups: typeof jpgEntries[] = jpgEntries.length > 0 ? [[jpgEntries[0]]] : [];
    for (let i = 1; i < jpgEntries.length; i++) {
      if (jpgEntries[i].mtime - jpgEntries[i-1].mtime > gapMs) groups.push([jpgEntries[i]]);
      else groups[groups.length-1].push(jpgEntries[i]);
    }

    const total = jpgEntries.length; let done = 0;
    const newScenes: FieldScene[] = [];

    if (fastAnalyzeMode) {
      // ═══ 빠른 분석 모드: 파일을 이동하지 않고 Scene 계획만 생성 ═══
      for (let si = 0; si < groups.length; si++) {
        if (cancelRef.current) break;
        const sceneNum = String(si+1).padStart(2,"0");
        const folderName = `Scene${sceneNum}`;
        const sceneFiles: SceneFile[] = [];

        for (const entry of groups[si]) {
          if (cancelRef.current) break;
          done++;
          if (done % 20 === 0 || Date.now() - lastUpdate > 300) {
            setProgress({ cur:done, total, msg:`씬 계획 생성: ${folderName} (${done}/${total})` });
            lastUpdate = Date.now();
          }
          // 파일 이동 없음, 썸네일 생성 없음
          sceneFiles.push({
            name: entry.name,
            basename: entry.name.replace(/\.[^.]+$/, ""),
            handle: entry.handle,
            mtime: entry.mtime,
            thumbUrl: null,
          });
        }

        newScenes.push({
          index: si+1, folderName, editedName: folderName,
          startTime: groups[si][0].mtime,
          endTime: groups[si][groups[si].length-1].mtime,
          fileCount: sceneFiles.length, files: sceneFiles, sceneDir: null,
          sceneType: null, suggestedName: null, aiConfidence: null, aiReason: null,
          subScenes: [], profileCount: 0, qualityRejectCount: 0,
          nameLoading: aiNamingEnabled || departmentLogicEnabled,
        });
      }
      setCopyLog([
        `✅ 빠른 분석 완료 — JPG ${total}장 / RAW ${rawFiles.length}개 / Scene ${newScenes.length}개`,
        `📋 파일 이동 없음 — Scene 계획만 생성됨 (RAW 원본 위치 유지)`,
        `👆 씬 검토 후 [폴더 정리 실행]을 눌러 실제 파일을 정리하세요`,
      ]);

    } else {
      // ═══ 정밀 분류 모드: 승인 전에는 파일을 이동하지 않음 ═══
      setClassificationJobState("EXTRACTING_FEATURES");
      setProgress({ cur: 0, total, msg: "저비용 시각 특징 추출 준비 중..." });
      const cacheKeys = jpgEntries.map((entry) => featureCacheKey(rootDir.name, entry.file));
      const cached = await Promise.all(cacheKeys.map((key) => getCachedFeature(key)));
      const missingIndices = cached.flatMap((feature, index) => feature ? [] : [index]);
      const missingFiles = missingIndices.map((index) => jpgEntries[index].file);
      const featureStartedAt = Date.now();
      const extracted = await extractFeaturesWithWorkers({
        files: missingFiles,
        concurrency: preciseSettings.maxConcurrentJobs,
        signal: abortController.signal,
        onProgress: (completed) => setProgress({
          cur: cached.filter(Boolean).length + completed,
          total,
          msg: `시각 특징 추출 ${cached.filter(Boolean).length + completed}/${total}${estimatedRemaining(completed, missingFiles.length, featureStartedAt)}`,
        }),
      });
      const features = [...cached] as Array<LocalVisualFeatures | null>;
      await Promise.all(extracted.map(async (result, offset) => {
        const originalIndex = missingIndices[offset];
        features[originalIndex] = result.features;
        if (result.features) await setCachedFeature(cacheKeys[originalIndex], result.features);
      }));
      const blankFeature: LocalVisualFeatures = { dHash: "0".repeat(64), colorHistogram: new Array(64).fill(0), backgroundGrid: new Array(24).fill(0), compositionGrid: new Array(16).fill(0), brightness: 0 };
      const firstValid = features.find((feature): feature is LocalVisualFeatures => Boolean(feature)) ?? blankFeature;
      const safeFeatures = features.map((feature, index) => feature ?? features[index - 1] ?? firstValid);
      const failedImages = extracted.filter((result) => !result.features).length;

      if (abortController.signal.aborted || cancelRef.current) {
        setClassificationJobState("CANCELLED");
        setCopyLog((previous) => [...previous, "⏸ 정밀 분류가 중단되었습니다. 원본 파일은 이동되지 않았습니다."]);
        useBackgroundJobsStore.getState().finishJob(PHOTO_CLASSIFY_JOB_ID, "cancelled");
        return;
      }

      setClassificationJobState("DETECTING_BOUNDARIES");
      const candidates = buildVisualBoundaryCandidates(jpgEntries, safeFeatures, preciseSettings);

      // ── 2차 Scene 분석: 하드갭 기준 임시 Scene(구간) 내부에서 촬영목적 전환 지점을 찾는다.
      // buildVisualBoundaryCandidates는 시각적 diff가 큰 지점만 후보로 잡으므로, 상담→시술처럼
      // 같은 공간·비슷한 톤으로 이어지는 목적 전환은 후보 자체가 안 생겨 놓치는 문제가 있었다.
      // 여기서는 구간을 촘촘히(6장 고정이 아니라 크기 비례) 샘플링해 목적 라벨을 매기고,
      // 라벨이 바뀌는 지점을 새 경계 후보로 추가한다 — 정확한 사진 단위 위치는 기존 검증 루프가
      // (아래 mapWithConcurrency) 3장 윈도우 AI 검증으로 다시 확인하므로 근사치면 충분하다.
      const purposeSegments = buildCandidateSegments(jpgEntries, preciseSettings.hardGapMinutes);
      const existingBoundaryIndexes = new Set(candidates.map((candidate) => candidate.boundaryIndex));
      setProgress({ cur: 0, total: purposeSegments.length, msg: "촬영목적 전환 스캔 준비" });
      let scannedSegments = 0;
      for (const segment of purposeSegments) {
        scannedSegments += 1;
        const segmentLength = segment.endIndex - segment.startIndex + 1;
        if (segmentLength < 8 || cancelRef.current || abortController.signal.aborted) continue;
        setProgress({ cur: scannedSegments, total: purposeSegments.length, msg: `촬영목적 전환 스캔 ${scannedSegments}/${purposeSegments.length}` });
        const localIndices = buildPurposeSampleIndices(segmentLength);
        try {
          const images = await Promise.all(localIndices.map(async (localIndex) => {
            const entry = jpgEntries[segment.startIndex + localIndex];
            return { fileName: entry.name, base64: await getApiThumb(entry.file), index: localIndex };
          }));
          const response = await withTimeout(fetch("/api/photo-scene-purpose-scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ department, images }),
            signal: abortController.signal,
          }), 60_000, "AI 목적 스캔");
          const data = await response.json();
          if (!response.ok || !data.ok) continue;
          const samples = (data.labels ?? []) as { index: number; purpose: HybridSceneType }[];
          const localTransitions = findPurposeTransitions(samples);
          for (const localTransition of localTransitions) {
            const globalIndex = segment.startIndex + localTransition;
            if (globalIndex <= 0 || globalIndex >= jpgEntries.length || existingBoundaryIndexes.has(globalIndex)) continue;
            existingBoundaryIndexes.add(globalIndex);
            const timeGapMs = Math.max(0, jpgEntries[globalIndex].mtime - jpgEntries[globalIndex - 1].mtime);
            candidates.push({ boundaryIndex: globalIndex, timeGapMs, visualChangeScore: 0, hardGap: false, requiresAi: true });
          }
        } catch {
          // 목적 스캔 실패는 치명적이지 않음 — 시각적 경계 후보만으로 계속 진행
        }
      }
      candidates.sort((left, right) => left.boundaryIndex - right.boundaryIndex);
      setProgress({ cur: 0, total: candidates.length, msg: `경계 후보 ${candidates.length}개 분석 준비(목적 전환 포함)` });

      const analyzeBoundary = async (boundaryIndex: number, windowSize: number, useHighModel: boolean): Promise<SceneFrameAnalysis> => {
        const beforeEntries = jpgEntries.slice(Math.max(0, boundaryIndex - windowSize), boundaryIndex);
        const afterEntries = jpgEntries.slice(boundaryIndex, Math.min(jpgEntries.length, boundaryIndex + windowSize));
        const [before, after] = await Promise.all([
          Promise.all(beforeEntries.map(async (entry) => ({ fileName: entry.name, base64: await getBoundaryApiImage(entry.file) }))),
          Promise.all(afterEntries.map(async (entry) => ({ fileName: entry.name, base64: await getBoundaryApiImage(entry.file) }))),
        ]);
        let lastError = "AI 경계 분석 실패";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await withTimeout(fetch("/api/photo-scene-boundary-analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ department, boundaryIndex, before, after, timeGapSeconds: (jpgEntries[boundaryIndex]?.mtime - jpgEntries[boundaryIndex - 1]?.mtime) / 1_000, options: { useHighModel } }),
              signal: abortController.signal,
            }), 60_000, "AI 경계 분석");
            const data = await response.json();
            if (response.ok && data.ok && data.analysis) return data.analysis as SceneFrameAnalysis;
            lastError = data.error ?? lastError;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
          if (attempt === 0 && !abortController.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error(lastError);
      };

      setClassificationJobState("VERIFYING_BOUNDARIES");
      const checkpointId = `${rootDir.name}:${department}:${effectiveGapMinutes}:precise-v2`;
      const checkpoint = await getClassificationCheckpoint<{ decisions: Record<string, SceneBoundaryDecision> }>(checkpointId);
      const checkpointDecisions: Record<string, SceneBoundaryDecision> = { ...(checkpoint?.decisions ?? {}) };
      const boundaryStartedAt = Date.now();
      const weights = aiWeightProfile?.weights;
      let verified = 0;
      const rawDecisions = await mapWithConcurrency(candidates, preciseSettings.maxConcurrentAiJobs, async (candidate) => {
        const beforeFileName = jpgEntries[candidate.boundaryIndex - 1]?.name ?? "";
        const afterFileName = jpgEntries[candidate.boundaryIndex]?.name ?? "";
        const checkpointKey = `${beforeFileName}→${afterFileName}`;
        if (checkpointDecisions[checkpointKey]) {
          verified += 1;
          setProgress({ cur: verified, total: candidates.length, msg: `경계 검증 복원 ${verified}/${candidates.length}${estimatedRemaining(verified, candidates.length, boundaryStartedAt)}` });
          const cachedDecision = checkpointDecisions[checkpointKey];
          // weights가 있으면(=AI 자동 분류 프로필 적용 중) Vision을 다시 부르지 않고 캐시된
          // aiAnalysis에 새 weights만 다시 적용한다 — 자연어로 가중치만 바꿨을 때 즉시 반영되면서도
          // 새 API 호출은 0번(스펙 §29/30). weights가 없으면(고급 설정) 예전처럼 그대로 반환.
          return weights
            ? decideBoundary({ candidate, analysis: cachedDecision.aiAnalysis ?? null, settings: preciseSettings, beforeFileName, afterFileName, weights })
            : cachedDecision;
        }
        if (candidate.hardGap) {
          verified += 1;
          setProgress({ cur: verified, total: candidates.length, msg: `경계 검증 ${verified}/${candidates.length}${estimatedRemaining(verified, candidates.length, boundaryStartedAt)}` });
          const hardDecision = decideBoundary({ candidate, analysis: null, settings: preciseSettings, beforeFileName, afterFileName, weights });
          checkpointDecisions[checkpointKey] = hardDecision;
          await setClassificationCheckpoint(checkpointId, { decisions: checkpointDecisions });
          return hardDecision;
        }
        try {
          let analysis = await analyzeBoundary(candidate.boundaryIndex, 3, false);
          let decision = decideBoundary({ candidate, analysis, settings: preciseSettings, beforeFileName, afterFileName, weights });
          if (decision.decision === "review") {
            analysis = await analyzeBoundary(candidate.boundaryIndex, 5, true);
            decision = decideBoundary({ candidate, analysis, settings: preciseSettings, beforeFileName, afterFileName, weights });
          }
          checkpointDecisions[checkpointKey] = decision;
          await setClassificationCheckpoint(checkpointId, { decisions: checkpointDecisions });
          return decision;
        } catch {
          const fallbackDecision = decideBoundary({ candidate, analysis: null, settings: preciseSettings, beforeFileName, afterFileName, aiFailed: true, weights });
          checkpointDecisions[checkpointKey] = fallbackDecision;
          await setClassificationCheckpoint(checkpointId, { decisions: checkpointDecisions });
          return fallbackDecision;
        } finally {
          verified += 1;
          setProgress({ cur: verified, total: candidates.length, msg: `경계 검증 ${verified}/${candidates.length}${estimatedRemaining(verified, candidates.length, boundaryStartedAt)}` });
        }
      });
      const stabilized = stabilizeBoundaries(rawDecisions, total, preciseSettings.minimumSceneImages);
      setBoundaryDecisions(stabilized);

      setClassificationJobState("CREATING_SCENES");
      const sceneFiles: SceneFile[] = jpgEntries.map((entry, index) => ({
        name: entry.name,
        basename: entry.name.replace(/\.[^.]+$/, ""),
        handle: entry.handle,
        mtime: entry.mtime,
        timestampSource: entry.timestampSource,
        thumbUrl: null,
        visualFeatures: safeFeatures[index],
      }));
      const preciseScenes = buildFieldScenesFromBoundaries(sceneFiles, stabilized);
      await mapWithConcurrency(preciseScenes, 3, async (scene) => {
        const thumbIndexes = Array.from(new Set([0, scene.files.length - 1]));
        await Promise.all(thumbIndexes.map(async (index) => {
          try { scene.files[index].thumbUrl = await loadThumb(await scene.files[index].handle.getFile(), 160); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
        }));
        return scene;
      });
      newScenes.push(...preciseScenes);
      const fallbackCount = jpgEntries.filter((entry) => entry.timestampSource === "mtime").length;
      setCopyLog([
        `✅ 하이브리드 분류 완료 — JPG ${total}장 / RAW ${rawFiles.length}개 / Scene ${newScenes.length}개`,
        `🧭 경계 후보 ${candidates.length}개 / AI 검토 필요 ${stabilized.filter((decision) => decision.needsReview).length}개`,
        `🕒 EXIF 없음·mtime 대체 ${fallbackCount}장 / 손상·특징 실패 ${failedImages}장`,
        `🔒 승인 전 파일 이동 없음 — 씬 검토 후 폴더 정리를 실행하세요`,
      ]);
      setProgress({ cur: total, total, msg: "하이브리드 Scene 계획 생성 완료" });
      setClassificationJobState("WAITING_REVIEW");
    }

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
  }, [rootDir, gapMinutes, aiNamingEnabled, departmentLogicEnabled, department, fastAnalyzeMode, isModal, isEmbedded, aiWeightProfile, photoDepartmentResolution.status]);

  // 피부과 2차 분리: 강한 전환 신호 감지
  const isDermatologyStrongTransition = (
    prevType: string, nextType: string,
    prevPosture?: string, nextPosture?: string,
    prevHandpiece?: boolean, nextHandpiece?: boolean,
    prevDevice?: boolean, nextDevice?: boolean,
  ): boolean => {
    const consultTypes = new Set(["doctor_consultation", "manager_consultation", "skin_care"]);
    const treatTypes   = new Set(["device_treatment", "lifting_laser_treatment", "laser_treatment", "injection_treatment"]);
    if (consultTypes.has(prevType) && treatTypes.has(nextType)) return true;
    if (prevPosture === "seated" && nextPosture === "lying_down") return true;
    if (!prevHandpiece && nextHandpiece) return true;
    if (!prevDevice && nextDevice) return true;
    return false;
  };

  const runSceneAiAnalysis = async (scenes: FieldScene[]) => {
    const updated = scenes.map(s => ({...s}));
    // 피부과 2차 분리를 위한 AI 응답 캐시
    const aiResults: Record<number, { sceneType: string; patientPosture?: string; hasHandpiece?: boolean; hasTreatmentDevice?: boolean; confidence: number }> = {};

    for (let i = 0; i < updated.length; i++) {
      try {
        const files = updated[i].files;
        const n = files.length;
        const idxSet = new Set([0, Math.min(1,n-1), Math.floor(n/2), Math.min(Math.floor(n/2)+1,n-1), Math.max(0,n-2), n-1]);
        const images: { fileName: string; base64: string }[] = [];
        for (const idx of idxSet) {
          try {
            const f = await files[idx].handle.getFile();
            images.push({ fileName: files[idx].name, base64: await getApiThumb(f) });
          } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
          if (images.length >= 6) break;
        }
        const sceneId = updated[i].folderName;
        const data = await withTimeout((async () => {
          const res = await fetch("/api/photo-scene-analyze", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ department, sceneId, images, options: { useHighModel: false } }),
          });
          return res.json();
        })(), 45000, "AI 씬 분석");
        if (data.ok) {
          const num = String(updated[i].index).padStart(2,"0");
          const dermatologyBaseNaming = department === "dermatology" && departmentLogicEnabled;
          const suggested = (aiNamingEnabled || dermatologyBaseNaming) && data.suggestedFolderName
            ? `${num}_${data.suggestedFolderName}` : null;
          updated[i] = {
            ...updated[i],
            sceneType: data.sceneType ?? null,
            suggestedName: suggested,
            aiConfidence: data.confidence ?? null,
            aiReason: data.reason ?? null,
            editedName: (aiNamingEnabled || dermatologyBaseNaming) && suggested ? suggested : updated[i].editedName,
            nameLoading: false,
            aiPatientPosture: data.patientPosture ?? null,
            aiHasHandpiece: data.hasHandpiece ?? null,
            aiHasTreatmentDevice: data.hasTreatmentDevice ?? null,
            aiHasTreatmentBed: data.hasTreatmentBed ?? null,
            aiHasConsultationDesk: data.hasConsultationDesk ?? null,
            aiEquipmentName: data.equipmentName ?? null,
            aiEquipmentBrand: data.equipmentBrand ?? null,
            aiHandpieceName: data.handpieceName ?? null,
            aiProcedureName: data.procedureName ?? null,
            aiProcedureCategory: data.procedureCategory ?? null,
            aiProcedureConfidence: data.procedureConfidence ?? null,
            aiNamingEvidence: Array.isArray(data.namingEvidence) ? data.namingEvidence : [],
          };
          aiResults[i] = {
            sceneType: data.sceneType ?? "etc",
            patientPosture: data.patientPosture,
            hasHandpiece: data.hasHandpiece,
            hasTreatmentDevice: data.hasTreatmentDevice,
            confidence: data.confidence ?? 0,
          };
        } else {
          updated[i] = { ...updated[i], nameLoading: false };
        }
      } catch {
        updated[i] = { ...updated[i], nameLoading: false };
      }
      setFieldScenes([...updated]);
    }

    // 피부과 2차 분리 후보 감지
    if (department === "dermatology" && Object.keys(aiResults).length >= 2) {
      const keys = Object.keys(aiResults).map(Number).sort((a,b)=>a-b);
      for (let k = 1; k < keys.length; k++) {
        const prev = aiResults[keys[k-1]];
        const curr = aiResults[keys[k]];
        if (!prev || !curr) continue;
        const isStrong = isDermatologyStrongTransition(
          prev.sceneType, curr.sceneType,
          prev.patientPosture, curr.patientPosture,
          prev.hasHandpiece, curr.hasHandpiece,
          prev.hasTreatmentDevice, curr.hasTreatmentDevice,
        );
        if (isStrong && curr.confidence >= 0.72) {
          const sceneIdx = keys[k];
          updated[sceneIdx] = {
            ...updated[sceneIdx],
            aiReason: `⚠️ 2차 분리 후보: 이전 씬(${updated[keys[k-1]].editedName})과 장면 전환 감지 — ${updated[sceneIdx].aiReason ?? ""}`,
          };
        }
      }
      setFieldScenes([...updated]);
    }

    // 병합/분리 후보 생성 (전 진료과 적용)
    if (updated.length >= 2) {
      const snapshots = updated.map(sc => ({
        folderName: sc.folderName,
        editedName: sc.editedName,
        sceneType: sc.sceneType ?? "",
        patientPosture: sc.aiPatientPosture,
        hasHandpiece: sc.aiHasHandpiece,
        hasTreatmentDevice: sc.aiHasTreatmentDevice,
        hasTreatmentBed: sc.aiHasTreatmentBed,
        hasConsultationDesk: sc.aiHasConsultationDesk,
      }));
      const candidates = buildMergeCandidates(snapshots, department);
      setMergeCandidates(candidates);
      setDismissedCandidates(new Set());
      setMergeDecisions([]);
    }
  };

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
    executionMode,
    isEmbedded,
    pendingBridgeClassificationPlan,
    setCurrentLocalFolder,
    setProgress,
    setPhotoDepartmentResolution,
    takeBridgeClassificationPlan,
    workflowRunId,
  ]);

  const mergeFieldScenes = useCallback(async (i: number, j: number, candidateId?: string) => {
    const si = fieldScenes[i];
    const sj = fieldScenes[j];

    // 병합 결정 기록
    if (candidateId) {
      const cand = mergeCandidates.find(c => c.id === candidateId);
      if (cand) {
        setMergeDecisions(prev => [...prev, {
          candidateId: cand.id,
          userAction: "merge",
          fromFolderName: cand.fromFolderName,
          toFolderName: cand.toFolderName,
          fromSceneType: cand.fromSceneType,
          toSceneType: cand.toSceneType,
          mergeScore: cand.mergeScore,
          matchedSignals: cand.matchedSignals,
          blockedSignals: cand.blockedSignals,
          recommendedAction: cand.recommendedAction,
        }]);
      }
    }

    // 병합된 두 씬과 관련된 candidate를 모두 dismiss (stale 방지)
    const affectedNames = new Set([si.folderName, sj.folderName]);
    setDismissedCandidates(prev => {
      const next = new Set([...prev]);
      for (const cand of mergeCandidates) {
        if (affectedNames.has(cand.fromFolderName) || affectedNames.has(cand.toFolderName)) {
          next.add(cand.id);
        }
      }
      return next;
    });

    if (!si.sceneDir || !sj.sceneDir) {
      // 승인 전 검토 모드: 메모리상 Scene 계획만 변경
      const correction = createMergeSceneCorrection(sj, rootDir?.name ?? "local");
      if (correction) {
        setSceneCorrections((previous) => [...previous, correction]);
        setBoundaryDecisions((previous) => markBoundaryAsManuallyMerged(previous, correction.boundaryIndex));
      }
      setFieldScenes((previous) => mergePlannedFieldScenes(previous, i, j));
      return;
    }

    // 정밀 정리 모드: 실제 파일 이동
    if (!fieldJpgBaseDir || !si.sceneDir || !sj.sceneDir) return;
    for (const f of sj.files) {
      try {
        await copyFileHandle(f.handle, si.sceneDir as FileSystemDirectoryHandle, f.name);
        await (sj.sceneDir as any).removeEntry(f.name);
      } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
    }
    try { await (fieldJpgBaseDir as any).removeEntry(sj.folderName); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
    setFieldScenes(prev => {
      const copy = [...prev];
      copy[i] = {
        ...si,
        files: [...si.files, ...sj.files],
        fileCount: si.fileCount + sj.fileCount,
        endTime: sj.endTime,
      };
      return copy.filter((_, idx) => idx !== j);
    });
  }, [fieldScenes, fieldJpgBaseDir, mergeCandidates, rootDir]);

  const splitFieldScene = useCallback((sceneIndex: number, offset: number) => {
    setFieldScenes((previous) => {
      const result = splitPlannedFieldScene(previous, sceneIndex, offset, rootDir?.name ?? "local");
      if (!result) return previous;
      setBoundaryDecisions((items) => [
        ...items.filter((item) => item.boundaryIndex !== result.boundaryDecision.boundaryIndex),
        result.boundaryDecision,
      ].sort((a, b) => a.boundaryIndex - b.boundaryIndex));
      setSceneCorrections((items) => [...items, result.correction]);
      return result.scenes;
    });
  }, [rootDir]);

  // PHASE 4(2026-08-30) — 아래 씬 검토 화면의 이름 입력칸(onChange+onBlur)이 하던 것과 정확히
  // 같은 일을 하나의 호출 가능한 함수로 뽑았다(로직 변경 없음, 이름만 붙임) — 채팅에서 "3번 씬
  // 이름 상담으로 바꿔"를 처리하려면 부를 수 있는 함수가 필요했다. 기존 입력칸 동작은 그대로 둔다.
  const renameFieldScene = useCallback((sceneIndex: number, newName: string) => {
    const scene = fieldScenes[sceneIndex];
    if (!scene || !newName.trim()) return false;
    setFieldScenes((previous) => previous.map((s, j) => (j === sceneIndex ? { ...s, editedName: newName } : s)));
    if (newName !== scene.folderName) {
      setSceneCorrections((previous) => [
        ...previous,
        createRenameSceneCorrection(scene, newName, rootDir?.name ?? "local"),
      ]);
    }
    return true;
  }, [fieldScenes, rootDir]);

  // AI 사진 분류 2.0 — Olivia Chat이 "지금 열려 있는 화면"에서 AI 자동 분류를 실행/재조정하게
  // 하는 채팅 전용 래퍼(스펙 §35/36). rename/merge/splitFieldScene과 달리 둘 다 비동기라(네트워크
  // 호출 포함) 완료를 기다렸다가 실제 결과(fieldScenesRef)를 함께 돌려준다 — 그래야 채팅이
  // "분류했습니다"를 실제 grouping 결과가 있을 때만 말할 수 있다(스펙 §37/44).
  const startAiClassificationForChat = useCallback(async (): Promise<{ ok: boolean; reason?: string; sceneCount?: number }> => {
    if (!rootDir) return { ok: false, reason: "먼저 화면에서 폴더를 선택해주세요." };
    await handleFieldSort();
    return { ok: true, sceneCount: fieldScenesRef.current.length };
  }, [rootDir, handleFieldSort]);

  const submitAiNlRequestForChat = useCallback(async (message: string): Promise<{ ok: boolean; sceneCount?: number }> => {
    await submitAiNlRequest(message);
    return { ok: true, sceneCount: fieldScenesRef.current.length };
  }, [submitAiNlRequest]);

  // PHASE 4(2026-08-30) — 채팅 도구(rename/merge/split_photo_scene)가 이 Workspace가 실제로
  // 열려 있을 때만 씬 편집을 실행할 수 있게, 지금 마운트된 인스턴스의 최신 함수를 등록해둔다
  // (useContractPdfHandlerStore와 동일 패턴). 언마운트되면 등록을 해제한다.
  // OLIVIA OS Phase 3 — isEmbedded(OS 창/PhotoWorkspace.tsx 탭)도 등록 대상에 추가했다. 원래
  // isModal(채팅→모달 플로우)만 체크해서, OS Desktop 창 안에서는(PhotoWorkspaceWindowContent가
  // mode="embedded"로 렌더) "이 폴더 분류해줘" 같은 RUN 액션이 조용히 실행할 대상을 못 찾는
  // 버그가 있었다.
  useEffect(() => {
    if (isModal || isEmbedded) {
      const bundle = {
        renameScene: renameFieldScene, mergeScenes: mergeFieldScenes, splitScene: splitFieldScene,
        startAiClassification: startAiClassificationForChat, submitNlRequest: submitAiNlRequestForChat,
      };
      usePhotoClassificationActionsStore.getState().registerActions(bundle);
      return () => {
        if (usePhotoClassificationActionsStore.getState().actions === bundle) {
          usePhotoClassificationActionsStore.getState().registerActions(null);
        }
      };
    }
  }, [isModal, isEmbedded, renameFieldScene, mergeFieldScenes, splitFieldScene, startAiClassificationForChat, submitAiNlRequestForChat]);

  const approveFieldScene = useCallback((sceneIndex: number) => {
    setFieldScenes((previous) => previous.map((scene, index) => index === sceneIndex ? { ...scene, approved: true } : scene));
    const scene = fieldScenes[sceneIndex];
    if (!scene || scene.approved) return;
    setSceneCorrections((previous) => [
      ...previous,
      createApproveSceneCorrection(scene, rootDir?.name ?? "local"),
    ]);
  }, [fieldScenes, rootDir]);

  const approveAllFieldScenes = useCallback(() => {
    const pending = fieldScenes.filter((scene) => !scene.approved);
    setFieldScenes((previous) => previous.map((scene) => ({ ...scene, approved: true })));
    setSceneCorrections((previous) => [
      ...previous,
      ...pending.map((scene) => createApproveSceneCorrection(scene, rootDir?.name ?? "local")),
    ]);
  }, [fieldScenes, rootDir]);

  const handleConfirmScenes = useCallback(async () => {
    if (!rootDir) return;
    setStep(3);
    setClassificationJobState("APPROVED");
    let lastUpdate = Date.now();
    try {

    if (fastAnalyzeMode || fieldScenes.some((scene) => !scene.sceneDir)) {
      // 승인 전 계획 모드: 씬 검토 확정 후에만 실제 파일 이동 실행
      setProgress({ cur:0, total:0, msg:"폴더 정리 중..." });
      const totalFiles = fieldScenes.reduce((s,sc)=>s+sc.fileCount,0);
      let done = 0;
      const reportDir = await (rootDir as any).getDirectoryHandle("REPORT", { create: true }) as FileSystemDirectoryHandle;
      const operations: Array<{ type: "copy_remove"; category: "RAW" | "JPG"; source: string; destination: string; status: "completed" | "failed"; error?: string; at: string }> = [];
      const writeReport = async (name: string, content: string) => {
        const handle = await (reportDir as any).getFileHandle(name, { create: true });
        const writer = await handle.createWritable();
        await writer.write("﻿" + content);
        await writer.close();
      };
      const flushJournal = async () => writeReport("file_operation_journal.json", JSON.stringify({ version: 1, root: rootDir.name, operations, updatedAt: new Date().toISOString() }, null, 2));

      // RAW → RAW/
      const rawBase = await (rootDir as any).getDirectoryHandle("RAW", { create:true }) as FileSystemDirectoryHandle;
      for (let i = 0; i < fieldRawHandles.length; i++) {
        if (cancelRef.current) break;
        if (i % 10 === 0 || Date.now() - lastUpdate > 300) {
          setProgress({ cur:i, total:fieldRawHandles.length, msg:`RAW 이동: ${fieldRawHandles[i].name}` });
          lastUpdate = Date.now();
        }
        try {
          await copyFileHandle(fieldRawHandles[i].handle, rawBase, fieldRawHandles[i].name);
          try { await (rootDir as any).removeEntry(fieldRawHandles[i].name); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
          operations.push({ type: "copy_remove", category: "RAW", source: fieldRawHandles[i].name, destination: `RAW/${fieldRawHandles[i].name}`, status: "completed", at: new Date().toISOString() });
        } catch (error) {
          operations.push({ type: "copy_remove", category: "RAW", source: fieldRawHandles[i].name, destination: `RAW/${fieldRawHandles[i].name}`, status: "failed", error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() });
        }
        if (i % 10 === 0) await flushJournal();
      }

      // JPG → 씬별 폴더로 이동
      const jpgBase = await (rootDir as any).getDirectoryHandle("JPG", { create:true }) as FileSystemDirectoryHandle;
      setFieldJpgBaseDir(jpgBase);
      try {
        const selectDir = await (rootDir as any).getDirectoryHandle("SELECT", { create:true });
        await (selectDir as any).getDirectoryHandle("JPG_SELECT", { create:true });
      } catch (error) { console.error("[OLIVIA] Suppressed error", error); }

      const updated = fieldScenes.map(sc => ({...sc}));
      for (let si = 0; si < updated.length; si++) {
        if (cancelRef.current) break;
        const sc = updated[si];
        const targetName = sc.editedName;
        const sceneDir = await (jpgBase as any).getDirectoryHandle(targetName, { create:true }) as FileSystemDirectoryHandle;
        const newFiles: SceneFile[] = [];

        for (const entry of sc.files) {
          if (cancelRef.current) break;
          if (done % 20 === 0 || Date.now() - lastUpdate > 300) {
            setProgress({ cur:done, total:totalFiles, msg:`${targetName}: ${entry.name}` });
            lastUpdate = Date.now();
          }
          try {
            await copyFileHandle(entry.handle, sceneDir, entry.name);
            const destHandle = await (sceneDir as any).getFileHandle(entry.name) as FileSystemFileHandle;
            try { await (rootDir as any).removeEntry(entry.name); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
            // 썸네일 lazy: 앞 4장만
            let thumbUrl: string | null = null;
            if (newFiles.length < 4) thumbUrl = await loadThumb(await destHandle.getFile(), 120);
            newFiles.push({ ...entry, handle: destHandle, thumbUrl });
            operations.push({ type: "copy_remove", category: "JPG", source: entry.name, destination: `JPG/${targetName}/${entry.name}`, status: "completed", at: new Date().toISOString() });
          } catch (error) {
            newFiles.push(entry);
            operations.push({ type: "copy_remove", category: "JPG", source: entry.name, destination: `JPG/${targetName}/${entry.name}`, status: "failed", error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() });
          }
          done++;
          if (done % 10 === 0) await flushJournal();
        }
        updated[si] = { ...sc, folderName: targetName, sceneDir, files: newFiles };
      }
      setFieldScenes(updated);
      await flushJournal();
      await clearClassificationCheckpoint(`${rootDir.name}:${department}:${gapMinutes}:precise-v2`);
      await Promise.all([
        writeReport("scene_boundaries.json", JSON.stringify({ version: 1, boundaries: boundaryDecisions, createdAt: new Date().toISOString() }, null, 2)),
        writeReport("scene_corrections.json", JSON.stringify({ version: 1, corrections: sceneCorrections, createdAt: new Date().toISOString() }, null, 2)),
        writeReport("scene_corrections.csv", makeCSV(
          ["project_id", "boundary_index", "boundary_file", "previous_decision", "corrected_decision", "action", "reason", "created_at"],
          sceneCorrections.map((item) => [item.projectId, String(item.boundaryIndex), item.boundaryFileName, item.previousDecision, item.correctedDecision, item.action, item.reason ?? "", item.createdAt]),
        )),
        ...(accuracyReport ? [writeReport("scene_accuracy_report.json", JSON.stringify({ ...accuracyReport, createdAt: new Date().toISOString() }, null, 2))] : []),
      ]);

      if (qualityAnalysisEnabled || profileClassificationEnabled) {
        await runSecondaryAnalysis(updated);
      } else {
        setFieldStats({
          totalJpg: totalFiles, totalRaw: fieldRawCount,
          totalScenes: updated.length, totalSubScenes: 0,
          totalProfile: 0, totalQualityReject: 0,
          selectedJpg: 0, selectedRawMoved: 0, rawMissing: 0,
        });
        setStep(4);
      }
      return;
    }

    // 정밀 정리 모드: 폴더 이름 변경만 적용
    if (!fieldJpgBaseDir) return;
    const updated = [...fieldScenes];
    for (let i = 0; i < updated.length; i++) {
      const sc = updated[i];
      if (sc.editedName !== sc.folderName && sc.sceneDir) {
        try {
          const newDir = await renameDirHandle(fieldJpgBaseDir as any, sc.folderName, sc.editedName, sc.sceneDir);
          const newFiles = sc.files.map(f => ({...f}));
          for (const pf of newFiles) {
            try { pf.handle = await (newDir as any).getFileHandle(pf.name) as FileSystemFileHandle; } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
          }
          updated[i] = { ...sc, folderName:sc.editedName, sceneDir:newDir, files:newFiles };
        } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
      }
    }
    setFieldScenes(updated);

    if (qualityAnalysisEnabled || profileClassificationEnabled) {
      await runSecondaryAnalysis(updated);
    } else {
      setStep(4);
      setFieldStats({
        totalJpg: updated.reduce((s,sc)=>s+sc.fileCount,0),
        totalRaw: fieldRawCount,
        totalScenes: updated.length,
        totalSubScenes: 0, totalProfile: 0, totalQualityReject: 0,
        selectedJpg: 0, selectedRawMoved: 0, rawMissing: 0,
      });
    }
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
  }, [fieldScenes, fieldJpgBaseDir, fieldRawHandles, qualityAnalysisEnabled, profileClassificationEnabled, fieldRawCount, fastAnalyzeMode, rootDir, boundaryDecisions, sceneCorrections, accuracyReport, department, gapMinutes]);

  // 프로필 제외 장면 타입 (이 타입이면 절대 프로필로 보내지 않음)
  const PROFILE_EXCLUDE_TYPES = PROFILE_EXCLUDED_SCENE_TYPES;

  const runSecondaryAnalysis = async (scenes: FieldScene[]) => {
    const total = scenes.reduce((s,sc)=>s+sc.fileCount,0);
    let done = 0, qualityRejectTotal = 0, profileTotal = 0;
    const qualityRows: string[][] = [];
    const profileRows: string[][] = [];
    let qualityExcDir: FileSystemDirectoryHandle | null = null;
    let profileDir: FileSystemDirectoryHandle | null = null;
    const updated = scenes.map(s => ({...s}));
    let lastUpdate = Date.now();

    for (let si = 0; si < updated.length; si++) {
      if (cancelRef.current) break;
      const sceneType = updated[si].sceneType ?? "";
      // 시술/상담 장면은 프로필 검사 자체를 건너뜀
      const skipProfile = PROFILE_EXCLUDE_TYPES.has(sceneType);

      for (let fi = 0; fi < updated[si].files.length; fi++) {
        if (cancelRef.current) break;
        const pf = updated[si].files[fi];

        // 진행률 throttle: 20장 단위 또는 300ms마다
        if (done % 20 === 0 || Date.now() - lastUpdate > 300) {
          setProgress({ cur:done, total, msg:`분석: ${pf.name}` });
          lastUpdate = Date.now();
        }

        try {
          const file = await pf.handle.getFile();

          if (qualityAnalysisEnabled) {
            const { blurScore, brightness } = await analyzeJpg(file);
            let rejectReason = "";
            if (blurScore < 18) rejectReason = "흔들림";
            else if (brightness < 38) rejectReason = "조명불량";
            else if (brightness > 230) rejectReason = "확인필요";

            if (rejectReason && updated[si].sceneDir && fieldJpgBaseDir) {
              if (!qualityExcDir) qualityExcDir = await (fieldJpgBaseDir as any).getDirectoryHandle("00_QUALITY_EXCLUDED", { create:true }) as FileSystemDirectoryHandle;
              const subDir = await (qualityExcDir as any).getDirectoryHandle(rejectReason, { create:true }) as FileSystemDirectoryHandle;
              await copyFileHandle(pf.handle, subDir, pf.name);
              try { await (updated[si].sceneDir as any).removeEntry(pf.name); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
              qualityRows.push([pf.name, updated[si].editedName, rejectReason, ""]);
              qualityRejectTotal++;
              updated[si].qualityRejectCount++;
            }
          }

          if (profileClassificationEnabled && !skipProfile) {
            // 절대 기준: (1) 사람이 정확히 1명 AND (2) 정면 응시 또는 팔짱/손깍지 등 의도된 정지 포즈.
            // 픽셀 대칭성/중앙정렬만 보던 예전 휴리스틱은 인원수·시선·포즈를 전혀 판단하지 못해
            // AI 비전 판정(/api/portrait-check)으로 교체했다.
            let personCount = 0, facingForward = false, intentionalPose = false, isProfileCandidate = false, confidence = 0;
            try {
              const data = await withTimeout((async () => {
                const thumb = await getApiThumb(file);
                const res = await fetch("/api/portrait-check", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ thumbnail: thumb }),
                });
                return res.json();
              })(), 45000, "프로필 판정");
              if (data.ok) {
                personCount = data.personCount ?? 0;
                facingForward = data.facingForward === true;
                intentionalPose = data.intentionalPose === true;
                isProfileCandidate = data.isProfile === true;
                confidence = data.confidence ?? 0;
              }
            } catch (error) { console.error("[OLIVIA] Suppressed error", error); }

            let movedTo = "";
            let rejectReason = "";

            if (isProfileCandidate && updated[si].sceneDir && rootDir) {
              if (!profileDir) profileDir = await (rootDir as any).getDirectoryHandle("PROFILE", { create:true }) as FileSystemDirectoryHandle;
              await copyFileHandle(pf.handle, profileDir, pf.name);
              try { await (updated[si].sceneDir as any).removeEntry(pf.name); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
              movedTo = "PROFILE/";
              profileTotal++;
              updated[si].profileCount++;
            } else if (!isProfileCandidate) {
              rejectReason = personCount !== 1
                ? `인원수 불일치(${personCount}명) — 1인이 아님`
                : `정면 응시·의도된 포즈 아님 (facingForward:${facingForward}, intentionalPose:${intentionalPose})`;
            }

            profileRows.push([
              pf.name,
              updated[si].editedName,
              confidence.toFixed(2),
              isProfileCandidate ? "true" : "false",
              String(personCount), "",
              facingForward ? "true" : "false",
              intentionalPose ? "true" : "false",
              "", "", "", "", "", "", "", "",
              rejectReason || (isProfileCandidate ? "프로필 조건 충족" : ""),
              movedTo,
            ]);
          } else if (profileClassificationEnabled && skipProfile) {
            // 시술/상담 장면 — 프로필 제외 기록
            profileRows.push([
              pf.name, updated[si].editedName, "0.00", "false",
              "", "", "", "", "", "", "", "", "", "", "", "",
              `${sceneType} 장면이므로 프로필 제외`,
              "",
            ]);
          }
        } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
        done++;
      }
      setFieldScenes([...updated]);
    }

    // 리포트 생성 (REPORT/ 폴더)
    try {
      const reportDir = await (rootDir as any).getDirectoryHandle("REPORT", { create:true });
      const wr = async (name: string, content: string) => {
        const fh = await (reportDir as any).getFileHandle(name, { create:true });
        const w = await fh.createWritable();
        await w.write("﻿" + content); await w.close();
      };
      if (qualityRows.length > 0)
        await wr("quality_report.csv", makeCSV(["file_name","scene","reason","note"], qualityRows));
      if (profileRows.length > 0)
        await wr("profile_report.csv", makeCSV([
          "file_name","original_scene","profile_confidence","is_profile",
          "main_person_count","has_patient","is_looking_at_camera","has_intentional_pose",
          "has_tool","has_medical_device","has_handpiece","has_syringe",
          "has_consultation_object","is_consultation","is_treatment","is_procedure",
          "reason","moved_to",
        ], profileRows));

      // scene_merge_report.csv
      if (mergeCandidates.length > 0) {
        const allDecisions = [...mergeDecisions];
        // 미결 후보도 기록
        for (const cand of mergeCandidates) {
          if (!allDecisions.find(d => d.candidateId === cand.id)) {
            allDecisions.push({
              candidateId: cand.id,
              userAction: dismissedCandidates.has(cand.id) ? "keep_split" : "keep_split",
              fromFolderName: cand.fromFolderName,
              toFolderName: cand.toFolderName,
              fromSceneType: cand.fromSceneType,
              toSceneType: cand.toSceneType,
              mergeScore: cand.mergeScore,
              matchedSignals: cand.matchedSignals,
              blockedSignals: cand.blockedSignals,
              recommendedAction: cand.recommendedAction,
            });
          }
        }
        const mergeRows = allDecisions.map(d => [
          d.candidateId,
          d.fromFolderName,
          d.toFolderName,
          d.fromSceneType,
          d.toSceneType,
          d.mergeScore.toFixed(2),
          d.recommendedAction,
          d.userAction,
          d.matchedSignals.join("|"),
          d.blockedSignals.join("|"),
        ]);
        await wr("scene_merge_report.csv", makeCSV([
          "candidate_id","from_scene","to_scene","from_scene_type","to_scene_type",
          "merge_score","recommended_action","user_action","matched_signals","blocked_signals",
        ], mergeRows));
      }

      // summary.json
      const summary = {
        mode: "field",
        fastAnalyzeMode,
        classificationMode: fastAnalyzeMode ? "fast" : "precise",
        rawInitialMoveEnabled: false,
        exifMode: fastAnalyzeMode ? "fast" : "precise",
        thumbnailMode: "lazy",
        profileStrictMode: true,
        dermatologySecondPassEnhanced: department === "dermatology",
        department,
        departmentDisplayName: DEPARTMENT_DISPLAY[department],
        gapMinutes,
        timeGapBuildsCandidatesOnly: !fastAnalyzeMode,
        departmentLogicEnabled,
        aiNamingEnabled,
        qualityAnalysisEnabled,
        profileClassificationEnabled,
        rawSelectMode,
        strongTransitionDetectionEnabled: true,
        mergeCandidateEnabled: true,
        reviewRequiredBeforeMove: true,
        totalJpg: total,
        totalRaw: fieldRawCount,
        totalInitialScenes: updated.length,
        totalMergeCandidates: mergeCandidates.filter(c => c.recommendedAction === "merge").length,
        totalKeepSplitRecommendations: mergeCandidates.filter(c => c.recommendedAction === "keep_split").length,
        totalFinalScenes: updated.length,
        totalProfile: profileTotal,
        totalQualityReject: qualityRejectTotal,
        createdAt: new Date().toISOString(),
      };
      await wr("summary.json", JSON.stringify(summary, null, 2));
    } catch (error) { console.error("[OLIVIA] Suppressed error", error); }

    setFieldStats({
      totalJpg: total, totalRaw: fieldRawCount,
      totalScenes: updated.length, totalSubScenes: 0,
      totalProfile: profileTotal, totalQualityReject: qualityRejectTotal,
      selectedJpg: 0, selectedRawMoved: 0, rawMissing: 0,
    });
    setStep(4);
  };

  /* ════════════════════════════════════════════
     STUDIO-MODE HANDLERS
  ═══════════════════════════════════════════ */
  const handleStudioSort = useCallback(async () => {
    if (!rootDir) return;
    setStep(1); cancelRef.current = false;
    setProgress({ cur:0, total:0, msg:"폴더 스캔 중..." });
    try {
    const { rawFiles, jpgFiles } = await splitRawAndJpg(rootDir);
    setStudioRawCount(rawFiles.length);
    jpgFiles.sort((a,b)=>a.mtime-b.mtime);
    const total = jpgFiles.length; let done = 0;
    const files: StudioPhotoFile[] = [];
    for (const sf of jpgFiles) {
      setProgress({ cur:done, total, msg:`스캔: ${sf.name}` });
      const file = await sf.handle.getFile();
      const thumb = await loadThumb(file, 100);
      const brightness = await quickBrightness(file);
      files.push({ name:sf.name, basename:sf.name.replace(/\.[^.]+$/,""), handle:sf.handle, mtime:sf.mtime, fileSize:sf.fileSize, thumbUrl:thumb, brightness, lightingStatus:"normal", hasGown:false, innerWear:"기타", clothingLabel:"미분류", poseType:"Unknown", isFamilyProfile:false, confidence:0, analyzed:false, groupKey:"__PENDING__" });
      done++;
    }
    setStudioFiles(files);
    setProgress({ cur:total, total, msg:`파일 분류 완료 — JPG ${jpgFiles.length}장 / RAW ${rawFiles.length}개` });
    setStep(2);
    if (studioSubMode === "group") {
      if (studioGroupSortMode === "gap") await runGapSort(files);
      else if (studioGroupSortMode === "gap_ai") await runGapAiSort(files);
      else await runGroupAnalysis(files);
    } else {
      await runStudioAnalysis(files);
    }
    // PHASE 4(2026-08-30) — handleFieldSort와 동일한 원칙, isModal || isEmbedded일 때만 채팅에
    // 요약 보고. 그룹 개수는 runGapSort/runGroupAnalysis 등이 각자 비동기로 state를 채워서
    // 여기서 안전하게 읽을 수 없어(클로저가 이전 값을 참조) 확실히 아는 값(총 사진 수)만 보고한다.
    if (isModal || isEmbedded) {
      const summary = `사진 분류 완료\n\n총 사진 ${jpgFiles.length}장`;
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
  }, [rootDir, studioOpts, studioSubMode, studioGroupSortMode, studioGapMinutes, isModal, isEmbedded]);

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

  const runGapSort = async (files: StudioPhotoFile[]) => {
    const result = groupStudioPhotosByTimeGap(files, studioGapMinutes, { markAnalyzed: true });
    setStudioFiles(result);
    setPersonGroups(buildPersonGroups(result));
    setStep(3);
  };

  const runGapAiSort = async (files: StudioPhotoFile[]) => {
    // 1단계: 파일 크기로 ETC 사전 필터 + 시간차로 인물 구분
    const withGap = groupStudioPhotosByTimeGap(files, studioGapMinutes);

    // 2단계: 크기로 통과한 컷만 AI 조명 검사
    const result = [...withGap];
    const needsAI = withGap.map((f,i) => ({f,i})).filter(({f}) => f.groupKey !== "__ETC__");
    const total = needsAI.length; let done = 0;
    const CONCURRENCY = 6;
    let qi = 0;
    const worker = async () => {
      while (qi < needsAI.length) {
        const { f, i } = needsAI[qi++];
        setProgress({ cur: done, total, msg: `AI 조명 검사: ${f.name}` });
        try {
          const file = await f.handle.getFile();
          const thumb = await getStudioThumb(file);
          const res = await fetch("/api/studio-face-analysis", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ thumbnail:thumb, lightingSensitivity:studioOpts.lightingSensitivity, lightingOnly:true }),
          });
          const data = await res.json();
          if (data.ok && data.lightingStatus !== "normal") {
            result[i] = { ...result[i], analyzed:true, lightingStatus:data.lightingStatus as StudioLightingStatus, groupKey:"__ETC__" };
          } else {
            result[i] = { ...result[i], analyzed:true };
          }
        } catch {
          result[i] = { ...result[i], analyzed:true };
        }
        done++;
        setStudioFiles([...result]);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    setPersonGroups(buildPersonGroups(result));
    setStep(3);
  };

  const runStudioAnalysis = async (files: StudioPhotoFile[]) => {
    const total = files.length; let done = 0;
    const CONCURRENCY = 8;
    const result = files.map(f => ({...f}));
    const indices = Array.from({length: total}, (_, i) => i);
    let qi = 0;
    const worker = async () => {
      while (qi < indices.length) {
        const idx = indices[qi++];
        const file = result[idx];
        setProgress({ cur:done, total, msg:`AI 분석: ${file.name}` });
        try {
          const data = await withTimeout((async () => {
            const f = await file.handle.getFile();
            const thumb = await getStudioThumb(f);
            const res = await fetch("/api/studio-analysis", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body:JSON.stringify({ thumbnail:thumb, lightingSensitivity:studioOpts.lightingSensitivity }),
            });
            return res.json();
          })(), 45000, "AI 분석");
          if (data.ok) {
            const isEtc = data.lightingStatus !== "normal";
            const hasGown: boolean = data.hasGown ?? false;
            const innerWear: StudioInnerWear = (["셔츠","넥타이셔츠","스크럽","블라우스","탑","기타"] as StudioInnerWear[]).includes(data.innerWear) ? data.innerWear : "기타";
            const poseType: StudioPoseType = (["Standing","Sitting","Unknown"] as StudioPoseType[]).includes(data.poseType) ? data.poseType : "Unknown";
            const isFamilyProfile: boolean = data.isFamilyProfile ?? false;
            const clothingLabel = computeClothingLabel(hasGown, innerWear, isFamilyProfile);
            const groupKey = isEtc ? "__ETC__" : computeGroupKey(hasGown, innerWear, poseType, isFamilyProfile);
            result[idx] = { ...file, lightingStatus:data.lightingStatus||"normal", hasGown, innerWear, clothingLabel, poseType, isFamilyProfile, confidence:data.confidence||0.5, analyzed:true, groupKey };
          } else {
            result[idx] = { ...file, analyzed:true, lightingStatus:"etc_test", groupKey:"__ETC__" };
          }
        } catch {
          result[idx] = { ...file, analyzed:true, lightingStatus:"etc_test", groupKey:"__ETC__" };
        }
        done++;
        setStudioFiles([...result]);
      }
    };
    await Promise.all(Array.from({length: CONCURRENCY}, () => worker()));
    const groups = buildStudioGroups(result);
    setStudioGroups(groups);
    setStep(3);
  };

  const runStudioOutput = useCallback(async () => {
    if (!rootDir || studioGroups.length === 0) return;
    setStep(5); cancelRef.current = false;
    const log: string[] = [];
    try {
    const rootName = rootDir.name;
    const selectedJpgDir = await (rootDir as any).getDirectoryHandle(`분류_${rootName}`, { create:true });
    const reportDir      = await (rootDir as any).getDirectoryHandle("AI_SELECT_REPORT", { create:true });
    const totalFiles = studioGroups.reduce((s,g)=>s+g.files.length,0);
    let processed = 0;
    const classRows: string[][] = [], groupRows: string[][] = [], etcRows: string[][] = [];
    for (const group of studioGroups) {
      const folderName = group.editedFolderName || group.suggestedFolderName;
      const groupDir = await (selectedJpgDir as any).getDirectoryHandle(folderName, { create:true });
      for (const file of group.files) {
        if (cancelRef.current) break;
        setProgress({ cur:processed, total:totalFiles, msg:`${folderName}: ${file.name}` });
        try {
          await copyFileHandle(file.handle, groupDir, file.name);
          if (studioFileMode === "move") await (rootDir as any).removeEntry(file.name).catch((error: unknown) => { console.error("[OLIVIA] Suppressed promise rejection", error); });
          log.push(`✅ ${file.name} → ${folderName}/`);
        } catch { log.push(`❌ ${file.name} 실패`); }
        if (group.isEtc) etcRows.push([file.name, file.lightingStatus, String(Math.round(file.brightness??0)), "", "", ""]);
        classRows.push([file.name, "", folderName, file.clothingLabel, file.poseType, file.lightingStatus, String(Math.round(file.confidence*100)/100), ""]);
        processed++; setStudioCopyLog([...log]);
      }
      if (!group.isEtc) {
        const f = group.files[0], l = group.files[group.files.length-1];
        const avgConf = group.files.reduce((s,x)=>s+x.confidence,0)/group.files.length;
        groupRows.push([String(group.index),folderName,group.clothingLabel,group.poseType,String(group.files.length),f.name,l.name,String(Math.round(avgConf*100)/100)]);
      }
    }
    const wr = async (name: string, content: string) => {
      try { const fh = await (reportDir as any).getFileHandle(name,{create:true}); const w = await fh.createWritable(); await w.write("﻿"+content); await w.close(); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
    };
    await wr("studio_classification_report.csv", makeCSV(["file_name","original_path","assigned_folder","clothing_label","pose_type","lighting_status","confidence","note"], classRows));
    await wr("studio_group_report.csv",           makeCSV(["group_id","folder_name","clothing_label","pose_type","file_count","first_file","last_file","confidence"], groupRows));
    await wr("studio_etc_report.csv",             makeCSV(["file_name","reason","brightness_score","face_brightness_score","previous_frame_delta","ai_comment"], etcRows));
    const etcGroup = studioGroups.find(g=>g.isEtc);
    const summary = { mode:"studio", total_jpg:studioFiles.length, total_raw:studioRawCount, total_groups:studioGroups.filter(g=>!g.isEtc).length, total_etc:etcGroup?.files.length??0, total_normal:studioGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0), output_path:`분류_${rootName}/`, created_at:new Date().toISOString() };
    await wr("summary.json", JSON.stringify(summary, null, 2));
    setStudioStats({ totalJpg:studioFiles.length, totalRaw:studioRawCount, totalGroups:studioGroups.filter(g=>!g.isEtc).length, totalEtc:etcGroup?.files.length??0, totalNormal:studioGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0) });
    setStep(6);
    } catch (error) {
      // 2026-09-10 수정 지시서 3번
      const message = error instanceof Error ? error.message : String(error);
      setStudioCopyLog((previous) => [...previous, `❌ 오류: 파일 정리를 완료하지 못했습니다 — ${message}`]);
      setStep(4);
    }
  }, [studioGroups, rootDir, studioFiles, studioRawCount, studioFileMode]);

  const runGroupAnalysis = async (files: StudioPhotoFile[]) => {
    const total = files.length; let done = 0;
    const CONCURRENCY = 8;
    const result = files.map(f => ({...f}));
    const indices = Array.from({length: total}, (_, i) => i);
    let qi = 0;
    const worker = async () => {
      while (qi < indices.length) {
        const idx = indices[qi++];
        const file = result[idx];
        setProgress({ cur:done, total, msg:`얼굴 분석: ${file.name}` });
        try {
          const data = await withTimeout((async () => {
            const f = await file.handle.getFile();
            const thumb = await getStudioThumb(f);
            const res = await fetch("/api/studio-face-analysis", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body:JSON.stringify({ thumbnail:thumb, lightingSensitivity:studioOpts.lightingSensitivity }),
            });
            return res.json();
          })(), 45000, "얼굴 분석");
          if (data.ok && data.lightingStatus === "normal") {
            const features = normalizePersonFeatures(data);
            result[idx] = { ...file, lightingStatus:"normal", personFeatures:features, analyzed:true, groupKey:"PENDING" };
          } else {
            result[idx] = { ...file, analyzed:true, lightingStatus:data.lightingStatus||"etc_test", groupKey:"__ETC__" };
          }
        } catch {
          result[idx] = { ...file, analyzed:true, lightingStatus:"etc_test", groupKey:"__ETC__" };
        }
        done++;
        setStudioFiles([...result]);
      }
    };
    await Promise.all(Array.from({length: CONCURRENCY}, () => worker()));

    const final = assignStudioPersonGroups(result);

    setStudioFiles(final);
    setPersonGroups(buildPersonGroups(final));
    setStep(3);
  };

  const runGroupOutput = useCallback(async () => {
    if (!rootDir || personGroups.length === 0) return;
    setStep(5); cancelRef.current = false;
    const log: string[] = [];
    try {
    const rootName = rootDir.name;
    const selectedJpgDir = await (rootDir as any).getDirectoryHandle(`분류_${rootName}`, { create:true });
    const reportDir      = await (rootDir as any).getDirectoryHandle("AI_SELECT_REPORT", { create:true });
    const totalFiles = personGroups.reduce((s,g) => s+g.files.length, 0);
    let processed = 0;
    const classRows: string[][] = [], groupRows: string[][] = [], etcRows: string[][] = [];
    for (const group of personGroups) {
      const folderName = group.editedFolderName;
      const groupDir = await (selectedJpgDir as any).getDirectoryHandle(folderName, { create:true });
      for (const file of group.files) {
        if (cancelRef.current) break;
        setProgress({ cur:processed, total:totalFiles, msg:`${folderName}: ${file.name}` });
        try {
          await copyFileHandle(file.handle, groupDir, file.name);
          if (studioFileMode === "move") await (rootDir as any).removeEntry(file.name).catch((error: unknown) => { console.error("[OLIVIA] Suppressed promise rejection", error); });
          log.push(`✅ ${file.name} → ${folderName}/`);
        } catch { log.push(`❌ ${file.name} 실패`); }
        if (group.isEtc) etcRows.push([file.name, file.lightingStatus, String(Math.round(file.brightness??0)), ""]);
        const pf = group.features;
        classRows.push([file.name, folderName, group.label, pf.gender, pf.ageBand, pf.hairColor, pf.hairLength, String(pf.hasGlasses), file.lightingStatus]);
        processed++; setStudioCopyLog([...log]);
      }
      if (!group.isEtc) {
        const f = group.files[0], l = group.files[group.files.length-1];
        groupRows.push([String(group.index), folderName, group.label, String(group.files.length), f.name, l.name]);
      }
    }
    const wr = async (name: string, content: string) => {
      try { const fh = await (reportDir as any).getFileHandle(name,{create:true}); const w = await fh.createWritable(); await w.write("﻿"+content); await w.close(); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
    };
    await wr("group_person_report.csv",    makeCSV(["group_id","folder_name","label","file_count","first_file","last_file"], groupRows));
    await wr("classification_detail.csv", makeCSV(["file_name","assigned_folder","person_label","gender","age_band","hair_color","hair_length","has_glasses","lighting_status"], classRows));
    await wr("etc_report.csv",             makeCSV(["file_name","reason","brightness","note"], etcRows));
    const etcGroup = personGroups.find(g=>g.isEtc);
    const summary = { mode:"studio_group", total_jpg:studioFiles.length, total_raw:studioRawCount, total_persons:personGroups.filter(g=>!g.isEtc).length, total_etc:etcGroup?.files.length??0, total_normal:personGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0), output_path:`분류_${rootName}/`, created_at:new Date().toISOString() };
    await wr("summary.json", JSON.stringify(summary, null, 2));
    setStudioStats({ totalJpg:studioFiles.length, totalRaw:studioRawCount, totalGroups:personGroups.filter(g=>!g.isEtc).length, totalEtc:etcGroup?.files.length??0, totalNormal:personGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0) });
    setStep(6);
    } catch (error) {
      // 2026-09-10 수정 지시서 3번
      const message = error instanceof Error ? error.message : String(error);
      setStudioCopyLog((previous) => [...previous, `❌ 오류: 파일 정리를 완료하지 못했습니다 — ${message}`]);
      setStep(4);
    }
  }, [personGroups, rootDir, studioFiles, studioRawCount, studioFileMode]);

  /* ════════════════════════════════════════════
     STEP INDICATOR
  ═══════════════════════════════════════════ */
  const renderStepIndicator = () => (
    <Stepper
      items={stepLabels.map((label, index) => ({ id: `${photoMode}-${index}`, label }))}
      activeIndex={Math.max(0, Math.min(step, stepLabels.length - 1))}
      ariaLabel="사진 분류 진행 단계"
    />
  );

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
  const Step0 = () => {
    const aiAutoActive = photoMode === "field" && classificationUiMode === "ai-auto";
    const departmentReady = photoDepartmentResolution.status === "resolved";
    return (
      <div style={{display:"flex",flexDirection:"column",gap:20,maxWidth: aiAutoActive ? 1120 : 700}}>

        {/* 이전 작업 복원 배너 */}
        {savedSession && photoSourceSurface === "desktop" && (
          <SavedPhotoSortingSessionBanner
            session={savedSession}
            onRestore={(session) => void handleRestore(session)}
            onClear={clearSession}
          />
        )}

        <PhotoShootingModeControl mode={photoMode} onChange={setPhotoMode} />

        {photoMode === "field" && (
          <>
            <ClassificationModeToggle mode={classificationUiMode} onChange={setClassificationUiMode} />

            {aiAutoActive ? (
              <div className="pc-ai-auto-grid" style={{display:"grid",gridTemplateColumns:"minmax(0,1.25fr) minmax(340px,.82fr)",gap:16,alignItems:"start"}}>
                {/* LEFT — 폴더/진료과(간단) + 자연어 요청 */}
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <Card>
                    <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.teal}}>폴더 선택</div>
                    <div style={{padding:20}}>
                      {renderPhotoSourceControl("RAW+JPG 혼합 폴더 선택")}
                    </div>
                  </Card>

                  <Card>
                    <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.teal}}>진료과</div>
                    {renderDepartmentControl(true)}
                  </Card>

                  <ClassificationPrompt onSubmit={submitAiNlRequest} busy={aiRefining} history={aiRefinementHistory} />
                </div>

                {/* CENTER — AI 분석 결과 + Scene 미리보기 + 시작 버튼 */}
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <FolderAnalysisSummary analyzing={aiAnalyzing} pattern={aiShootingPattern} fileCount={aiScanFileCount} />
                  <SceneProposalList proposals={aiSceneProposals} />
                  {executionMode === "LOCAL_DIRECT" && photoSourceSurface === "desktop" && !hasFS && <div style={{padding:14,background:"rgba(214,188,125,.12)",borderRadius:10,fontSize:12,color:"#D6BC7D",border:"1px solid rgba(214,188,125,.36)"}}>⚠️ Chrome 또는 Edge 브라우저에서만 로컬 파일 시스템 접근이 가능합니다.</div>}
                  <Btn
                    onClick={executionMode === "LOCAL_DIRECT" ? handleFieldSort : handleRemotePhotoSort}
                    disabled={executionMode === "LOCAL_DIRECT" ? (!rootDir||!hasFS||aiAnalyzing||!departmentReady) : (!remoteSelection?.path||!remoteWorkFolderReady||remotePhotoSortActive||remoteWorkerOffline||!departmentReady)}
                  >
                    {executionMode === "REMOTE_WORKER" ? "Mac Studio에서 AI 자동 분류 시작" : "AI 자동 분류 시작"}
                  </Btn>
                  {(Boolean(rootDir) || Boolean(remoteSelection?.path)) && !departmentReady ? (
                    <div style={{fontSize:10.5,color:C.hint,textAlign:"center"}}>진료과를 확인해야 분류를 시작할 수 있습니다.</div>
                  ) : null}
                  <ClassificationProfilePanel profile={aiWeightProfile} onOpenAdvanced={() => setClassificationUiMode("advanced")} />
                </div>
              </div>
            ) : (
              <>
                {/* 폴더 선택 */}
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.teal}}>폴더 선택</div>
                  <div style={{padding:20}}>
                    {renderPhotoSourceControl("RAW+JPG 혼합 폴더 선택")}
                  </div>
                </Card>

                {/* 진료과 선택 */}
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.teal}}>진료과</div>
                  {renderDepartmentControl()}
                </Card>

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

                {executionMode === "LOCAL_DIRECT" && photoSourceSurface === "desktop" && !hasFS && <div style={{padding:14,background:"rgba(214,188,125,.12)",borderRadius:10,fontSize:12,color:"#D6BC7D",border:"1px solid rgba(214,188,125,.36)"}}>⚠️ Chrome 또는 Edge 브라우저에서만 로컬 파일 시스템 접근이 가능합니다.</div>}
                <Btn
                  onClick={executionMode === "LOCAL_DIRECT" ? handleFieldSort : handleRemotePhotoSort}
                  disabled={executionMode === "LOCAL_DIRECT" ? (!rootDir||!hasFS||!departmentReady) : (!remoteSelection?.path||!remoteWorkFolderReady||remotePhotoSortActive||remoteWorkerOffline||!departmentReady)}
                >
                  {executionMode === "REMOTE_WORKER" ? "Mac Studio에서 AI 자동 분류 시작" : "현장촬영 분류 시작"}
                </Btn>
                {(Boolean(rootDir) || Boolean(remoteSelection?.path)) && !departmentReady ? (
                  <div style={{fontSize:10.5,color:C.hint,textAlign:"center"}}>진료과를 확인해야 분류를 시작할 수 있습니다.</div>
                ) : null}
              </>
            )}
          </>
        )}

        {photoMode === "studio" && (
          <>
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
            {executionMode === "LOCAL_DIRECT" && photoSourceSurface === "desktop" && !hasFS && <div style={{padding:14,background:"rgba(214,188,125,.12)",borderRadius:10,fontSize:12,color:"#D6BC7D",border:"1px solid rgba(214,188,125,.36)"}}>⚠️ Chrome 또는 Edge 브라우저에서만 로컬 파일 시스템 접근이 가능합니다.</div>}
            <Btn
              style={{background:C.purple}}
              onClick={executionMode === "LOCAL_DIRECT" ? handleStudioSort : handleRemotePhotoSort}
              disabled={executionMode === "LOCAL_DIRECT" ? (!rootDir||!hasFS) : (!remoteSelection?.path||!remoteWorkFolderReady||remotePhotoSortActive||remoteWorkerOffline)}
            >
              {executionMode === "REMOTE_WORKER" ? "Mac Studio에서 AI 자동 분류 시작" : "스튜디오 분류 시작"}
            </Btn>
          </>
        )}
      </div>
    );
  };

  /* ════════════════════════════════════════════
     FIELD STEPS
  ═══════════════════════════════════════════ */
  const FieldStep1 = () => (
    <PhotoClassificationProgressView
      title={fastAnalyzeMode ? "⚡ 빠른 분석 중 (파일 이동 없음)..." : "🔍 하이브리드 Scene 분석 중..."}
      progress={progress}
      statusText={fastAnalyzeMode ? undefined : `현재 단계: ${classificationJobState}`}
      hideProgressUntilStarted
      logs={copyLog}
      logLimit={20}
      onCancel={fastAnalyzeMode ? undefined : () => {
        cancelRef.current = true;
        classificationAbortRef.current?.abort();
        setClassificationJobState("CANCELLED");
      }}
      cancelLabel="분석 중단"
    />
  );

  const dismissFieldMergeCandidate = useCallback((candidateId: string) => {
    const candidate = mergeCandidates.find((item) => item.id === candidateId);
    if (candidate) {
      setMergeDecisions((previous) => [...previous, {
        candidateId: candidate.id,
        userAction: "keep_split",
        fromFolderName: candidate.fromFolderName,
        toFolderName: candidate.toFolderName,
        fromSceneType: candidate.fromSceneType,
        toSceneType: candidate.toSceneType,
        mergeScore: candidate.mergeScore,
        matchedSignals: candidate.matchedSignals,
        blockedSignals: candidate.blockedSignals,
        recommendedAction: candidate.recommendedAction,
      }]);
    }
    setDismissedCandidates((previous) => new Set([...previous, candidateId]));
  }, [mergeCandidates]);

  const commitFieldSceneName = useCallback((scene: FieldScene) => {
    if (scene.editedName === scene.folderName) return;
    setSceneCorrections((previous) => [
      ...previous,
      createRenameSceneCorrection(scene, scene.editedName, rootDir?.name ?? "local"),
    ]);
  }, [rootDir]);

  const FieldStep2 = () => {
    const allLoaded = fieldScenes.every(s=>!s.nameLoading);
    const allApproved = fieldScenes.length > 0 && fieldScenes.every((scene) => scene.approved);
    const boundaryReviewCount = boundaryDecisions.filter((decision) => decision.needsReview).length;
    const totalJpg = fieldScenes.reduce((s,sc)=>s+sc.fileCount,0);
    const allFieldFiles = fieldScenes.flatMap((scene) => scene.files);
    return (
      <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:860}}>
        <FieldSceneReviewOverview
          bridgePlanSummary={bridgePlanSummary}
          fastAnalyzeMode={fastAnalyzeMode}
          boundaryReviewCount={boundaryReviewCount}
          aiAnalysisPending={(aiNamingEnabled || departmentLogicEnabled) && !allLoaded}
          approvedCount={fieldScenes.filter((scene) => scene.approved).length}
          sceneCount={fieldScenes.length}
          onApproveAll={approveAllFieldScenes}
          evaluationMode={evaluationMode}
          onEvaluationModeChange={setEvaluationMode}
          files={allFieldFiles}
          groundTruthSelection={groundTruthSelection}
          onGroundTruthSelectionChange={setGroundTruthSelection}
          groundTruthBoundaries={groundTruthBoundaries}
          onGroundTruthBoundariesChange={setGroundTruthBoundaries}
          boundaryDecisions={boundaryDecisions}
          accuracyReport={accuracyReport}
          onAccuracyReportChange={setAccuracyReport}
          mergeCandidates={mergeCandidates}
          dismissedCandidates={dismissedCandidates}
        />

        <FieldSceneReviewList
          scenes={fieldScenes}
          totalJpg={totalJpg}
          rawCount={fieldRawCount}
          departmentLabel={DEPARTMENT_DISPLAY[department]}
          mergeCandidates={mergeCandidates}
          dismissedCandidates={dismissedCandidates}
          splitPositions={splitPositions}
          onSceneFocus={(sceneIndex) => useOliviaContextStore.getState().setSelection("photo_scene", String(sceneIndex))}
          onSceneNameChange={(sceneIndex, value) => setFieldScenes((previous) => previous.map((scene, index) => index === sceneIndex ? { ...scene, editedName: value } : scene))}
          onSceneNameCommit={commitFieldSceneName}
          onSuggestedNameApply={(sceneIndex, value) => setFieldScenes((previous) => previous.map((scene, index) => index === sceneIndex ? { ...scene, editedName: value } : scene))}
          onSplitPositionChange={(sceneIndex, value) => setSplitPositions((previous) => ({ ...previous, [sceneIndex]: value }))}
          onSplitScene={splitFieldScene}
          onMergeScenes={(fromIndex, toIndex, candidateId) => void mergeFieldScenes(fromIndex, toIndex, candidateId)}
          onApproveScene={approveFieldScene}
          onDismissCandidate={dismissFieldMergeCandidate}
        />

        <div className="ps-btn-row">
          <Btn variant="secondary" onClick={()=>setStep(0)}>← 처음으로</Btn>
          <Btn onClick={handleConfirmScenes} disabled={!allLoaded || !allApproved}>
            {!allLoaded ? "AI 분석 중..." : !allApproved ? "Scene 승인 필요" : "승인 결과로 폴더 정리"}
          </Btn>
        </div>
      </div>
    );
  };

  const FieldStep3 = () => (
    <PhotoClassificationProgressView
      title={fastAnalyzeMode ? "📁 폴더 정리 실행 중..." : "분석 중..."}
      progress={progress}
      details={[
        fastAnalyzeMode ? "• RAW 이동 → JPG 씬 폴더 정리 중" : "",
        qualityAnalysisEnabled ? "• 흔들림·조명불량 분석 중" : "",
        profileClassificationEnabled ? "• 프로필 자동 분류 중 (엄격 모드)" : "",
      ].filter(Boolean).join("\n")}
      onCancel={() => { cancelRef.current = true; }}
    />
  );

  const FieldStep4 = () => {
    if (!fieldStats) return null;
    return (
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
    );
  };

  /* ════════════════════════════════════════════
     STUDIO STEPS
  ═══════════════════════════════════════════ */
  const StudioStep1 = () => (
    <PhotoClassificationProgressView
      title="파일 분류 중..."
      titleColor={C.purple}
      progress={progress}
    />
  );

  const StudioStep2 = () => {
    const analyzed = studioFiles.filter(f=>f.analyzed).length;
    const total    = studioFiles.length;
    return (
      <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
        <div style={{fontSize:14,fontWeight:500,color:C.purple}}>
        {studioSubMode === "group" ? "AI 얼굴 분석 중..." : "AI 의상·포즈·조명 분석 중..."}
      </div>
        <ProgressBar cur={analyzed} total={total} msg={progress.msg}/>
        <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[["전체 JPG",total,C.teal],["분석 완료",analyzed,C.green],["ETC 후보",studioFiles.filter(f=>f.groupKey==="__ETC__").length,C.red]].map(([l,v,c])=>(
            <div key={l as string} style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:600,color:c as string}}>{v}</div>
              <div style={{fontSize:10,color:C.hint}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const StudioStep3 = () => {
    const etcGroup    = studioGroups.find(g=>g.isEtc);
    const normalGroups = studioGroups.filter(g=>!g.isEtc);
    return (
      <StudioGroupEditView
        description={<>
          AI가 의상·포즈 기준으로 그룹을 분류했습니다. 폴더명을 수정한 후 <strong>승인</strong>해주세요.
        </>}
        groupHeading="의상·포즈 그룹"
        groupCountUnit="개"
        etcFiles={etcGroup?.files ?? []}
        groups={normalGroups.map((group) => ({
          id: group.key,
          kind: "concept" as const,
          editedFolderName: group.editedFolderName,
          files: group.files,
          poseType: group.poseType,
          confidence: group.files.reduce((sum, file) => sum + file.confidence, 0) / group.files.length,
        }))}
        onFolderNameChange={(groupId, value) => setStudioGroups((current) => current.map((group) => (
          group.key === groupId ? { ...group, editedFolderName: value } : group
        )))}
        onBack={() => setStep(0)}
        onApprove={() => setStep(4)}
      />
    );
  };

  const StudioGroupStep3 = () => {
    const etcGroup    = personGroups.find(g=>g.isEtc);
    const normalGroups = personGroups.filter(g=>!g.isEtc);
    return (
      <StudioGroupEditView
        description={<>
          AI가 얼굴 특징(성별·연령·헤어·안경)을 기준으로 인물별 그룹을 분류했습니다. 폴더명을 수정한 후 <strong>승인</strong>해주세요.
        </>}
        groupHeading="인물 그룹"
        groupCountUnit="명"
        etcFiles={etcGroup?.files ?? []}
        groups={normalGroups.map((group) => ({
          id: group.id,
          kind: "person" as const,
          editedFolderName: group.editedFolderName,
          files: group.files,
          sampleThumb: group.sampleThumb,
          tags: buildPersonFeatureTags(group.features, { includeHairLength: true }),
          index: group.index,
        }))}
        onFolderNameChange={(groupId, value) => setPersonGroups((current) => current.map((group) => (
          group.id === groupId ? { ...group, editedFolderName: value } : group
        )))}
        onBack={() => setStep(0)}
        onApprove={() => setStep(4)}
      />
    );
  };

  const StudioGroupStep4 = () => {
    const etcGroup    = personGroups.find(g=>g.isEtc);
    const normalGroups = personGroups.filter(g=>!g.isEtc);
    return (
      <StudioGroupConfirmationView
        groups={personGroups.map((group) => ({
          id: group.id,
          tabLabel: group.editedFolderName,
          editedFolderName: group.editedFolderName,
          isEtc: group.isEtc,
          files: group.files,
          tags: buildPersonFeatureTags(group.features).map((label) => ({ label })),
        }))}
        activeIndex={activePersonGroup}
        stats={[
          { label: "인물 수", value: normalGroups.length, color: C.purple },
          { label: "전체 JPG", value: normalGroups.reduce((sum, group) => sum + group.files.length, 0), color: C.txt },
          { label: "ETC", value: etcGroup?.files.length ?? 0, color: C.red },
          { label: "RAW 파일", value: studioRawCount, color: C.muted },
        ]}
        onActiveIndexChange={setActivePersonGroup}
        onBack={() => setStep(3)}
        onStart={runGroupOutput}
      />
    );
  };

  const StudioStep4 = () => {
    const etcGroup     = studioGroups.find(g=>g.isEtc);
    const normalGroups = studioGroups.filter(g=>!g.isEtc);
    return (
      <StudioGroupConfirmationView
        groups={studioGroups.map((group) => ({
          id: group.key,
          tabLabel: group.editedFolderName.split("_").slice(1).join("_"),
          editedFolderName: group.editedFolderName,
          isEtc: group.isEtc,
          files: group.files,
          tags: [
            { label: group.clothingLabel },
            { label: group.poseType, tone: "orange" as const },
          ],
        }))}
        activeIndex={activeGroup}
        stats={[
          { label: "전체 그룹", value: normalGroups.length, color: C.purple },
          { label: "전체 JPG", value: normalGroups.reduce((sum, group) => sum + group.files.length, 0), color: C.txt },
          { label: "ETC", value: etcGroup?.files.length ?? 0, color: C.red },
          { label: "RAW 파일", value: studioRawCount, color: C.muted },
        ]}
        onActiveIndexChange={setActiveGroup}
        onBack={() => setStep(3)}
        onStart={runStudioOutput}
      />
    );
  };

  const StudioStep5 = () => (
    <PhotoClassificationProgressView
      title="스튜디오 파일 정리 중..."
      titleColor={C.purple}
      progress={progress}
      logs={studioCopyLog}
      logColor={(line) => line.startsWith("✅") ? C.green : line.startsWith("❌") ? C.red : C.yellow}
      maxWidth={680}
    />
  );

  const StudioStep6 = () => {
    if (!studioStats) return null;
    const isGroup = studioSubMode === "group";
    return (
      <StudioClassificationCompleteView
        stats={[
          { label: isGroup ? "인물 그룹" : "의상·포즈 그룹", value: studioStats.totalGroups, color: C.purple },
          { label: "정상 JPG", value: studioStats.totalNormal, color: C.teal },
          { label: "ETC 분리", value: studioStats.totalEtc, color: C.red },
          { label: "원본 RAW", value: studioStats.totalRaw, color: C.muted },
        ]}
        rootFolderName={rootDir?.name ?? ""}
        groupDescription={isGroup ? "인물별" : "의상·포즈별"}
        downloadLabel={isGroup ? "↓ 인물 요약 CSV" : "↓ 그룹 요약 CSV"}
        onDownload={() => {
          if (isGroup) {
            downloadCSV(
              makeCSV(["인물", "폴더명", "장수"], personGroups.filter((group) => !group.isEtc).map((group) => [group.label, group.editedFolderName, String(group.files.length)])),
              "person_group_summary.csv",
            );
            return;
          }
          downloadCSV(
            makeCSV(["그룹", "폴더명", "의상", "포즈", "장수"], studioGroups.filter((group) => !group.isEtc).map((group) => [String(group.index), group.editedFolderName, group.clothingLabel, group.poseType, String(group.files.length)])),
            "studio_group_summary.csv",
          );
        }}
        onReset={() => {
          setStep(0);
          setStudioFiles([]);
          setStudioGroups([]);
          setPersonGroups([]);
          setRootDir(null);
          setStudioRawCount(0);
          setStudioCopyLog([]);
          setStudioStats(null);
        }}
      />
    );
  };

  /* ════════════════════════════════════════════
     LAYOUT
  ═══════════════════════════════════════════ */
  return (
    <div>

      {step > 0 && (
        <div className="ps-mode-badge" style={{background:photoMode==="studio"?"#F5F0FF":C.light,color:photoMode==="studio"?C.purple:C.teal,borderBottom:`1px solid ${photoMode==="studio"?"#DDD6FE":C.border}`}}>
          {photoMode==="studio"
            ? (studioSubMode==="group" ? "스튜디오 · 여러명 모드" : "스튜디오 · 한명 모드")
            : `현장촬영 — ${DEPARTMENT_DISPLAY[department]} — ${gapMinutes}분`}
        </div>
      )}

      <section
        className="photo-sorting-surface"
        data-photo-sorting-surface={isEmbedded ? "workspace" : "standalone"}
        style={{background:isEmbedded?"#2A2A2A":C.bg,minHeight:isModal||isEmbedded?undefined:"100vh",color:isEmbedded?"rgba(255,255,255,.88)":C.txt,paddingBottom:isEmbedded?24:0}}
      >
        {isEmbedded ? (
          <style>{`
            [data-photo-sorting-surface="workspace"] select,
            [data-photo-sorting-surface="workspace"] textarea,
            [data-photo-sorting-surface="workspace"] input:not([type="checkbox"]):not([type="radio"]) {
              background: rgba(0,0,0,.16) !important;
              border-color: rgba(255,255,255,.15) !important;
              color: rgba(255,255,255,.88) !important;
              color-scheme: dark;
            }
            [data-photo-sorting-surface="workspace"] select:focus,
            [data-photo-sorting-surface="workspace"] textarea:focus,
            [data-photo-sorting-surface="workspace"] input:focus {
              border-color: #4FD8B8 !important;
              box-shadow: 0 0 0 3px rgba(79,216,184,.10);
              outline: none;
            }
            @container (max-width: 700px) {
              [data-photo-sorting-surface="workspace"] .pc-mobile-form-grid,
              [data-photo-sorting-surface="workspace"] .pc-ai-auto-grid,
              [data-photo-sorting-surface="workspace"] .ps-stat4 {
                grid-template-columns: minmax(0, 1fr) !important;
              }
              [data-photo-sorting-surface="workspace"] .ps-btn-row {
                align-items: stretch !important;
                flex-direction: column !important;
              }
              [data-photo-sorting-surface="workspace"] .ps-wrap {
                width: 100%;
                max-width: none !important;
                padding-inline: 12px;
              }
              [data-photo-sorting-surface="workspace"] > header > span:last-child {
                display: none !important;
              }
            }
          `}</style>
        ) : null}
        {isEmbedded ? (
          <header style={{ minHeight: 70, display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.10)" }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(79,216,184,.12)", color: "#4FD8B8", flexShrink: 0 }}>
              <FolderTree size={18} strokeWidth={1.8} />
            </span>
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,.88)" }}>사진 분류</strong>
              <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "rgba(255,255,255,.52)" }}>사진을 분석해 장면별 폴더 구조로 정리합니다.</span>
            </span>
            <span style={{ marginLeft: "auto", maxWidth: "42%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,.13)", borderRadius: 999, padding: "7px 10px", color: "rgba(255,255,255,.65)", fontSize: 11 }}>
              현재 작업 폴더: <strong style={{ color: "rgba(255,255,255,.88)", fontWeight: 500 }}>{rootDir?.name ?? "선택 안 됨"}</strong>
            </span>
          </header>
        ) : null}
        {renderStepIndicator()}
        <div className="ps-wrap" style={{maxWidth:960,margin:"0 auto"}}>
          {step===0 && <Step0/>}

          {photoMode==="field" && step===1 && <FieldStep1/>}
          {photoMode==="field" && step===2 && <FieldStep2/>}
          {photoMode==="field" && step===3 && <FieldStep3/>}
          {photoMode==="field" && step===4 && <FieldStep4/>}

          {photoMode==="studio" && step===1 && <StudioStep1/>}
          {photoMode==="studio" && step===2 && <StudioStep2/>}
          {photoMode==="studio" && step===3 && (studioSubMode==="group" ? <StudioGroupStep3/> : <StudioStep3/>)}
          {photoMode==="studio" && step===4 && (studioSubMode==="group" ? <StudioGroupStep4/> : <StudioStep4/>)}
          {photoMode==="studio" && step===5 && <StudioStep5/>}
          {photoMode==="studio" && step===6 && <StudioStep6/>}
        </div>
        {isEmbedded ? <footer style={{ minHeight:70, display:"flex", alignItems:"center", padding:"0 20px", borderTop:"1px solid rgba(255,255,255,.10)", color:"rgba(255,255,255,.48)", fontSize:11 }}>
          {step === 0 ? "작업 폴더와 분류 기준을 선택하세요." : "분류 결과를 확인하고 다음 단계를 진행하세요."}
        </footer> : null}
      </section>

      {photoSourcePickerOpen ? (
        <PhotoSourcePicker
          onCancel={closePhotoSourcePicker}
          onSelectRemote={selectRemoteFolder}
        />
      ) : null}
    </div>
  );
}
