"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Folder,
  FolderOpen,
  LoaderCircle,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { BridgeFloatingWindow } from "@/components/olivia-bridge/BridgeFloatingWindow";
import {
  BridgeFullscreenPreview,
  BridgeSelectionReview,
  formatBytes,
} from "@/components/olivia-bridge/OliviaBridgeMedia";
import { BridgePaneDivider } from "@/components/olivia-bridge/OliviaBridgePaneDivider";
import {
  BRIDGE_TOOL_ITEMS,
  OliviaBridgeActionBar,
  type BridgeToolKey as ToolKey,
} from "@/components/olivia-bridge/OliviaBridgeActionBar";
import {
  OliviaBridgeFolderPanel,
  type BridgeWorkspaceFileFilter as FileFilter,
  type BridgeWorkspaceQualityFilter as QualityFilter,
} from "@/components/olivia-bridge/OliviaBridgeFolderPanel";
import {
  OliviaBridgePreviewPanel,
  type OliviaBridgePreviewTab,
} from "@/components/olivia-bridge/OliviaBridgePreviewPanel";
import { OliviaBridgeBrowserPanel } from "@/components/olivia-bridge/OliviaBridgeBrowserPanel";
import {
  OliviaBridgeSceneReviewContent,
} from "@/components/olivia-bridge/OliviaBridgeSceneReviewContent";
import { useOliviaBridgeSceneAnalysis } from "@/components/olivia-bridge/useOliviaBridgeSceneAnalysis";
import { useOliviaBridgeAdobeMarks } from "@/components/olivia-bridge/useOliviaBridgeAdobeMarks";
import { useOliviaBridgeCaptureMetadata } from "@/components/olivia-bridge/useOliviaBridgeCaptureMetadata";
import { useOliviaBridgePersonSelectionImport } from "@/components/olivia-bridge/useOliviaBridgePersonSelectionImport";
import { useOliviaBridgeCustomerSelectionImport } from "@/components/olivia-bridge/useOliviaBridgeCustomerSelectionImport";
import { useOliviaBridgeFolderCounts } from "@/components/olivia-bridge/useOliviaBridgeFolderCounts";
import { useOliviaBridgeMarqueeSelection } from "@/components/olivia-bridge/useOliviaBridgeMarqueeSelection";
import { useOliviaBridgeSelectionReview } from "@/components/olivia-bridge/useOliviaBridgeSelectionReview";
import { useOliviaBridgeSelectionLabels } from "@/components/olivia-bridge/useOliviaBridgeSelectionLabels";
import { useOliviaBridgeKeyboard } from "@/components/olivia-bridge/useOliviaBridgeKeyboard";
import { useOliviaBridgeFolderRestore } from "@/components/olivia-bridge/useOliviaBridgeFolderRestore";
import { useOliviaBridgePhotoNavigation } from "@/components/olivia-bridge/useOliviaBridgePhotoNavigation";
import { useOliviaBridgeVisibleFiles } from "@/components/olivia-bridge/useOliviaBridgeVisibleFiles";
import {
  BridgeFolderSourceDialog,
  BridgeGallerySelectionDialog,
  BridgePersonSelectionDialog,
  BridgeRawRootPromptDialog,
} from "@/components/olivia-bridge/OliviaBridgeDialogs";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import {
  rebuildBridgeSceneAnalysis,
  resolveBridgeToolSelection,
  type BridgeFolderScan,
  type BridgeJpgSortMode,
} from "@/lib/photo-bridge/bridgeFiles";
import { createBridgeClassificationPlan } from "@/lib/photo-bridge/classificationPlan";
import type { BridgeFloatingWindowRect } from "@/lib/photo-bridge/floatingWindow";
import {
  loadLocalBridgeFolderSnapshot,
  loadRemoteBridgeFolderSnapshot,
} from "@/lib/photo-bridge/folderLoader";
import { readBridgeFolderSelectionSource } from "@/lib/photo-bridge/folderSession";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import {
  DEFAULT_BRIDGE_SELECTION_SOURCE,
  normalizePhotoToolFileKey,
  resolveBridgeSelection,
  type BridgeSelectionSource,
} from "@/lib/photo-bridge/toolLinkage";
import {
  bridgeRawMatchDefaultFolder,
  bridgeRawMatchFolderCandidates,
  resolveBridgeFolderTrail,
  saveBridgeFolderTrail,
  type BridgeFolderTrailItem,
} from "@/lib/photo-bridge/recentFolder";
import {
  BRIDGE_COLOR_LABELS,
  EMPTY_BRIDGE_LABEL_FILTERS,
  bridgeLabelFilterName,
  resolveBridgeRatings,
  updateBridgeLabelFilters,
  type BridgeColorLabel,
  type BridgeColorLabels,
  type BridgeLabelFilterCommand,
  type BridgeLabelFilters,
} from "@/lib/photo-bridge/labels";
import { useBridgeSearchFilterShortcuts } from "@/lib/photo-bridge/useBridgeSearchFilterShortcuts";
import { resetBridgeThumbnailCache } from "@/lib/photo-bridge/thumbnailCache";
import { createBridgeSelectionSummary } from "@/lib/photo-bridge/selectionSummary";
import {
  projectBridgeColorLabelsByName,
  projectBridgeRatingsByName,
  projectBridgeSelectedFiles,
  projectBridgeSelectedNames,
  resolveBridgeRatingsByName,
  resolveBridgeSelectedIdsByName,
} from "@/lib/photo-bridge/selectionProjection";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { useDesktopWindowMode, useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import styles from "./OliviaBridgeWorkspace.module.css";

const EmbeddedPhotoTool = dynamic(
  () => import("@/components/photo-workspace/PhotoWorkspace").then((module) => module.PhotoWorkspaceEmbeddedTool),
  {
    ssr: false,
    loading: () => <div className={styles.toolLoading}><LoaderCircle size={18} /> 기존 사진 도구를 여는 중...</div>,
  },
);

const PhotoSourcePicker = dynamic(
  () => import("@/components/photo-classifier/PhotoSourcePicker"),
  { ssr: false },
);

type Breadcrumb = BridgeFolderTrailItem;

const EMPTY_SCAN: BridgeFolderScan = {
  folders: [],
  jpgs: [],
  raws: [],
  sidecars: [],
  ignoredCount: 0,
  nestedJpgCount: 0,
  unreadableFolderCount: 0,
};

const THUMBNAIL_SIZE_MIN = 96;
const THUMBNAIL_SIZE_MAX = 240;
const THUMBNAIL_SIZE_STEP = 18;
const THUMBNAIL_SIZE_DEFAULT = 156;

export default function OliviaBridgeWorkspace({
  clientId,
  workflowRunId,
}: {
  clientId?: string;
  workflowRunId?: string;
} = {}) {
  const sp = useSearchParams();
  const desktopWindowMode = useDesktopWindowMode();
  const { routeHref, navigate } = useDesktopWindowRoute();
  const picker = usePhotoFolderPicker();
  const {
    currentLocalFolder,
    setCurrentLocalFolder,
    setRawMatchDefaultFolder,
    setRawMatchFolderCandidates,
    selectedJpgNames,
    setSelectedJpgNames,
    setSelectedJpgFiles,
    jpgRatingsByName,
    setJpgRatingsByName,
    setJpgColorLabelsByName,
    setRawMatchFolderPath,
    setExecutionMode,
    stageBridgeClassificationPlan,
    photoDepartmentResolution,
    setPhotoDepartmentResolution,
  } = usePhotoStudioExecution();
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [remoteFolder, setRemoteFolder] = useState<RemoteNasSelection | null>(null);
  const [scan, setScan] = useState<BridgeFolderScan>(EMPTY_SCAN);
  const [scanStatus, setScanStatus] = useState<"idle" | "restoring" | "loading" | "ready" | "error">("restoring");
  const [remoteLoadProgress, setRemoteLoadProgress] = useState<{ received: number; total: number } | null>(null);
  const [, setScanError] = useState<string>();
  const [includeNestedJpgs, setIncludeNestedJpgs] = useState(false);
  const [restoreTrail, setRestoreTrail] = useState<Breadcrumb[]>([]);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [selectedIds, setSelectedIdsState] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const manualSelectedIdsRef = useRef<Set<string>>(new Set());
  const adobeSelectedIdsRef = useRef<Set<string>>(new Set());
  const manualRemovedIdsRef = useRef<Set<string>>(new Set());
  const [selectionSource, setSelectionSource] = useState<BridgeSelectionSource>(DEFAULT_BRIDGE_SELECTION_SOURCE);
  const selectionSourceRef = useRef<BridgeSelectionSource>(DEFAULT_BRIDGE_SELECTION_SOURCE);
  const [topNotice, setTopNotice] = useState("");
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [toolKey, setToolKey] = useState<ToolKey>();
  const [sceneReviewOpen, setSceneReviewOpen] = useState(false);
  const [thumbnailSize, setThumbnailSize] = useState(THUMBNAIL_SIZE_DEFAULT);
  const [jpgSortMode, setJpgSortMode] = useState<BridgeJpgSortMode>("filename");
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [labelFilters, setLabelFilters] = useState<BridgeLabelFilters>(() => ({ ...EMPTY_BRIDGE_LABEL_FILTERS }));
  const [filenameSearch, setFilenameSearch] = useState("");
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>();
  const [fullscreenPreviewOpen, setFullscreenPreviewOpen] = useState(false);
  const [folderSourceOpen, setFolderSourceOpen] = useState(false);
  const [nasPickerOpen, setNasPickerOpen] = useState(false);
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [rawRootPromptOpen, setRawRootPromptOpen] = useState(false);
  const [rawRootPromptError, setRawRootPromptError] = useState("");
  const [previewTab, setPreviewTab] = useState<OliviaBridgePreviewTab>("selection");
  const [compactPreviewOpen, setCompactPreviewOpen] = useState(false);
  const [compactFiltersOpen, setCompactFiltersOpen] = useState(false);
  const [focusedPlainId, setFocusedPlainId] = useState<string | null>(null);
  const floatingWindowRectsRef = useRef<Record<string, BridgeFloatingWindowRect>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const folderPanelRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const compactFilterButtonRef = useRef<HTMLButtonElement>(null);
  const previewPanelRef = useRef<HTMLElement>(null);
  const remoteLoadGenerationRef = useRef(0);
  const lastPublishedRatingsRef = useRef<Record<string, number> | null>(null);
  const topNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawMatchOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTopNotice = useCallback((message: string, duration = 3_000) => {
    if (topNoticeTimerRef.current) clearTimeout(topNoticeTimerRef.current);
    setTopNotice(message);
    topNoticeTimerRef.current = setTimeout(() => {
      setTopNotice("");
      topNoticeTimerRef.current = null;
    }, duration);
  }, []);

  const showAdobeSelectionNotice = useCallback(() => {
    showTopNotice("어도비 기준입니다. 별점은 어도비 브릿지에서 바꿔 주세요.");
  }, [showTopNotice]);

  const activeFolder = breadcrumbs.at(-1)?.handle ?? null;
  const folderPath = remoteFolder?.path ?? breadcrumbs.map((item) => item.name).join(" / ");
  const folderSelectionSourceKey = remoteFolder?.path ?? breadcrumbs.map((item) => item.name).join("/");
  const activeFolderName = activeFolder?.name ?? remoteFolder?.displayPath.split("/").filter(Boolean).at(-1) ?? "";
  const hasActiveFolder = Boolean(activeFolder || remoteFolder);
  const {
    ratings,
    setRatings,
    ratingEdits,
    setRatingEdits,
    colorLabels,
    setColorLabels,
    excludedIds,
    setExcludedIds,
    ratingsRef,
    ratingEditsRef,
    applyRating,
    applyColorLabel,
    clearColorLabels,
    toggleExcluded,
  } = useOliviaBridgeSelectionLabels({
    jpgs: scan.jpgs,
    selectedIds,
    focusedId,
    selectionSourceRef,
    setJpgRatingsByName,
    showAdobeSelectionNotice,
  });
  const folderImageCounts = useOliviaBridgeFolderCounts(activeFolder, scan.folders);
  const captureMetadataState = useOliviaBridgeCaptureMetadata({
    jpgSortMode,
    scanStatus,
    scan,
    setScan,
  });
  const {
    personSelectDialogOpen,
    personSelectEvents,
    personSelectEventsLoading,
    personSelectImportingId,
    personSelectError,
    personSelectResult,
    loadPersonSelectEvents,
    openPersonSelectImport,
    closePersonSelectImport,
    importPersonSelectEvent,
    chooseAnotherPersonSelect,
  } = useOliviaBridgePersonSelectionImport({
    hasActiveFolder,
    scanStatus,
    jpgs: scan.jpgs,
    manualSelectedIdsRef,
    workspaceRef: rootRef,
    setSelectedJpgNames,
  });
  const {
    gallerySelectDialogOpen,
    selectGalleries,
    sharedSelectProjects,
    selectGalleriesLoading,
    gallerySelectImportingId,
    gallerySelectError,
    galleryCustomerResult,
    customerSelectedIds,
    customerRatings,
    customerNotes,
    comparisonFilter,
    setComparisonFilter,
    qualityByBridgeId,
    qualityJob,
    qualityMessage,
    loadSelectGalleries,
    openGallerySelectImport,
    closeGallerySelectImport,
    chooseAnotherGallerySelection,
    importGalleryCustomerSelection,
    importSharedProjectSelection,
    startLinkedQualityAnalysis,
    controlLinkedQualityAnalysis,
  } = useOliviaBridgeCustomerSelectionImport({
    hasActiveFolder,
    scanStatus,
    jpgs: scan.jpgs,
    folderPath,
    activeFolderName,
    remoteFolder,
    workspaceRef: rootRef,
  });
  const commitSelectedIds = useCallback((
    manual: ReadonlySet<string>,
    adobe: ReadonlySet<string>,
    source = selectionSourceRef.current,
  ) => {
    const nextManual = new Set(manual);
    const nextAdobe = new Set(adobe);
    const next = resolveBridgeSelection(source, nextManual, nextAdobe, manualRemovedIdsRef.current);
    manualSelectedIdsRef.current = nextManual;
    adobeSelectedIdsRef.current = nextAdobe;
    selectedIdsRef.current = next;
    setSelectedIdsState(next);
    setSelectedJpgNames(projectBridgeSelectedNames(scan.jpgs, next));
  }, [scan.jpgs, setSelectedJpgNames]);

  const publishRatingsForSource = useCallback((
    source: BridgeSelectionSource,
    nextAdobe: Record<string, number>,
  ) => {
    const resolved = resolveBridgeRatings(source, ratingsRef.current, nextAdobe, ratingEditsRef.current);
    const byId = Object.fromEntries(scan.jpgs.flatMap((photo) => resolved[photo.id] ? [[photo.id, resolved[photo.id]] as const] : []));
    lastPublishedRatingsRef.current = byId;
    setJpgRatingsByName(
      projectBridgeRatingsByName(scan.jpgs, resolved),
      { overwrite: true },
    );
  }, [scan.jpgs, setJpgRatingsByName]);

  const {
    adobeRatings,
    adobeColorLabels,
    rawAdobeMarks,
    adobeSelectionLoading,
    adobeMarkStatus,
    resetAdobeMarks,
    syncAdobeBridgeSelection,
  } = useOliviaBridgeAdobeMarks({
    activeFolder,
    remoteFolder,
    scan,
    scanStatus,
    selectionSource,
    selectionSourceRef,
    manualSelectedIdsRef,
    commitSelectedIds,
    publishRatingsForSource,
  });
  const {
    sceneState,
    departmentLoading,
    departmentError,
    departmentPickerOpen,
    chooseDepartment,
    retrySceneAnalysis,
    openDepartmentPicker,
    reportScenePlanError,
  } = useOliviaBridgeSceneAnalysis({
    hasActiveFolder,
    scanStatus,
    jpgs: scan.jpgs,
    folderPath,
    activeFolderName,
    clientId,
    workflowRunId,
    setDepartmentResolution: setPhotoDepartmentResolution,
  });
  const remoteProjectSelection = useMemo<RemoteNasSelection | undefined>(() => {
    if (!remoteFolder) return undefined;
    const pathParts = remoteFolder.path.split("/").filter(Boolean);
    const displayParts = remoteFolder.displayPath.split("/").filter(Boolean);
    if (pathParts.at(-1)?.normalize("NFC") === JPG_INTEGRATED_DIRECTORY) pathParts.pop();
    if (displayParts.at(-1)?.normalize("NFC") === JPG_INTEGRATED_DIRECTORY) displayParts.pop();
    return {
      ...remoteFolder,
      path: pathParts.join("/"),
      displayPath: displayParts.join("/"),
    };
  }, [remoteFolder]);
  const effectiveRatings = useMemo(
    () => resolveBridgeRatings(selectionSource, ratings, adobeRatings, ratingEdits),
    [adobeRatings, ratingEdits, ratings, selectionSource],
  );
  const effectiveColorLabels = useMemo<BridgeColorLabels>(() => (
    selectionSource === "olivia"
      ? colorLabels
      : selectionSource === "adobe"
        ? adobeColorLabels
        : { ...adobeColorLabels, ...colorLabels }
  ), [adobeColorLabels, colorLabels, selectionSource]);
  const rawMarkByFileKey = useMemo(() => new Map(scan.raws.flatMap((raw) => {
    const mark = rawAdobeMarks[raw.id];
    return mark ? [[normalizePhotoToolFileKey(raw.name), mark] as const] : [];
  })), [rawAdobeMarks, scan.raws]);
  const selectedNames = useMemo(() => scan.jpgs.filter((photo) => selectedIds.has(photo.id)).map((photo) => photo.name), [scan.jpgs, selectedIds]);
  const {
    filenameSearchTokens,
    hasLabelFilters,
    visibleJpgs,
    visiblePhotoById,
    comparisonCounts,
    qualityCounts,
    showRaws,
    showSidecars,
    focusedIndex,
    focusedPhoto,
    visiblePlainFiles,
    focusedPlainFile,
  } = useOliviaBridgeVisibleFiles({
    scan,
    jpgSortMode,
    fileFilter,
    labelFilters,
    filenameSearch,
    effectiveRatings,
    effectiveColorLabels,
    excludedIds,
    qualityByBridgeId,
    qualityFilter,
    comparisonFilter,
    selectedIds,
    customerSelectedIds,
    focusedId,
    focusedPlainId,
  });
  const activeTool = BRIDGE_TOOL_ITEMS.find((item) => item.key === toolKey);

  const setSelectedIds = useCallback((value: Set<string> | ((current: Set<string>) => Set<string>)) => {
    if (selectionSourceRef.current === "adobe") return;
    const requested = typeof value === "function" ? value(selectedIdsRef.current) : value;
    if (selectionSourceRef.current === "olivia") {
      commitSelectedIds(new Set(requested), adobeSelectedIdsRef.current);
      return;
    }
    const manual = new Set(manualSelectedIdsRef.current);
    const removed = new Set(manualRemovedIdsRef.current);
    const knownIds = new Set([...selectedIdsRef.current, ...requested, ...manual, ...adobeSelectedIdsRef.current]);
    for (const id of knownIds) {
      if (adobeSelectedIdsRef.current.has(id)) {
        if (requested.has(id)) removed.delete(id);
        else removed.add(id);
      } else if (requested.has(id)) manual.add(id);
      else manual.delete(id);
    }
    manualRemovedIdsRef.current = removed;
    commitSelectedIds(manual, adobeSelectedIdsRef.current);
  }, [commitSelectedIds]);

  const commitMarqueeSelection = useCallback((selection: Set<string>, focusedPhotoId: string | null) => {
    setSelectedIds(selection);
    setFocusedId(focusedPhotoId);
    setAnchorId(focusedPhotoId);
    setPreviewSize(undefined);
  }, [setSelectedIds]);

  const {
    fileAreaRef,
    marqueeRef,
    suppressThumbnailClickRef,
    handleFileAreaPointerDown,
    handleFileAreaPointerMove,
    handleFileAreaPointerUp,
    handleFileAreaPointerCancel,
  } = useOliviaBridgeMarqueeSelection({
    selectedIds,
    visibleJpgs,
    onCommit: commitMarqueeSelection,
  });

  const {
    selectionReviewOpen,
    reviewRemoved,
    reviewPhotos,
    resolvedReviewActiveId,
    reviewActiveIndex,
    reviewActivePhoto,
    focusReviewPhoto,
    openSelectionReview,
    closeSelectionReview,
    moveReview,
    removeReviewPhoto,
    restoreReviewPhoto,
  } = useOliviaBridgeSelectionReview({
    jpgs: scan.jpgs,
    jpgSortMode,
    selectedIds,
    focusedId,
    selectionSourceRef,
    manualSelectedIdsRef,
    adobeSelectedIdsRef,
    workspaceRef: rootRef,
    setSelectedIds,
    setFocusedId,
    setFocusedPlainId,
    setAnchorId,
    setPreviewSize,
    showAdobeSelectionNotice,
  });

  const changeSelectionSource = useCallback((source: BridgeSelectionSource) => {
    selectionSourceRef.current = source;
    setSelectionSource(source);
    if (folderSelectionSourceKey) {
      try {
        localStorage.setItem(`olivia-bridge-selection-source:${folderSelectionSourceKey}`, source);
      } catch {
        // 브라우저 저장소를 사용할 수 없어도 현재 창의 기준 변경은 유지한다.
      }
    }
    commitSelectedIds(manualSelectedIdsRef.current, adobeSelectedIdsRef.current, source);
    publishRatingsForSource(source, adobeRatings);
  }, [adobeRatings, commitSelectedIds, folderSelectionSourceKey, publishRatingsForSource]);

  const updateFloatingWindowRect = useCallback((windowId: string, rect: BridgeFloatingWindowRect) => {
    floatingWindowRectsRef.current[windowId] = rect;
  }, []);

  useEffect(() => {
    setSelectedJpgFiles(projectBridgeSelectedFiles(scan.jpgs, selectedIds));
  }, [scan.jpgs, selectedIds, setSelectedJpgFiles]);

  useEffect(() => {
    setJpgColorLabelsByName(
      projectBridgeColorLabelsByName(scan.jpgs, effectiveColorLabels),
      { overwrite: true },
    );
  }, [effectiveColorLabels, scan.jpgs, setJpgColorLabelsByName]);

  useEffect(() => {
    const next = resolveBridgeSelectedIdsByName(scan.jpgs, selectedJpgNames);
    if (selectedIdsRef.current.size === next.size && [...selectedIdsRef.current].every((id) => next.has(id))) return;
    setSelectedIds(next);
  }, [scan.jpgs, selectedJpgNames, setSelectedIds]);

  useEffect(() => {
    const next = resolveBridgeRatingsByName(scan.jpgs, jpgRatingsByName);
    const published = lastPublishedRatingsRef.current;
    if (published) {
      const publishedEntries = Object.entries(published);
      const nextEntries = Object.entries(next);
      if (publishedEntries.length === nextEntries.length && publishedEntries.every(([id, rating]) => next[id] === rating)) {
        lastPublishedRatingsRef.current = null;
        return;
      }
    }
    if (selectionSource !== "olivia") return;
    setRatings((current) => {
      const currentEntries = Object.entries(current);
      const nextEntries = Object.entries(next);
      if (currentEntries.length === nextEntries.length && currentEntries.every(([id, rating]) => next[id] === rating)) return current;
      return next;
    });
  }, [jpgRatingsByName, scan.jpgs, selectionSource]);

  useEffect(() => () => {
    if (topNoticeTimerRef.current) clearTimeout(topNoticeTimerRef.current);
    if (rawMatchOpenTimerRef.current) clearTimeout(rawMatchOpenTimerRef.current);
  }, []);

  useEffect(() => {
    if (focusedIndex >= 0) return;
    const next = visibleJpgs[0] ?? null;
    setFocusedId(next?.id ?? null);
    setAnchorId(next?.id ?? null);
    setPreviewSize(undefined);
  }, [focusedIndex, visibleJpgs]);

  useEffect(() => {
    if (focusedPlainFile || !visiblePlainFiles.length) return;
    setFocusedPlainId(visiblePlainFiles[0].id);
  }, [focusedPlainFile, visiblePlainFiles]);

  useEffect(() => {
    const context = useOliviaContextStore.getState();
    context.setWorkspace("photo-sort", folderPath || undefined);
    context.setSelection(focusedPhoto ? "file" : focusedPlainFile ? "file" : undefined, focusedPhoto?.id ?? focusedPlainFile?.id);
  }, [focusedPhoto, focusedPlainFile, folderPath, selectedNames]);

  useEffect(() => {
    const focused = focusedPhoto ?? focusedPlainFile;
    if (!focused) {
      emitShellSelection({ clear: true, sourceAppId: "olivia-bridge", sourceWindowId: "olivia-bridge" });
      return;
    }
    emitShellSelection({
      sourceAppId: "olivia-bridge",
      sourceWindowId: "olivia-bridge",
      itemId: focused.id,
      title: focused.name,
      subtitle: `${focused.extension} · ${formatBytes(focused.size)} · 선택 JPG ${selectedNames.length}장`,
      next: focusedPhoto ? "미리보기와 별점, 선택 상태를 확인합니다." : "RAW와 사이드카 파일 정보를 확인합니다.",
      appId: "olivia-bridge",
      context: { clientId, workflowRunId, projectId: workflowRunId, resourceId: folderPath || undefined, resourceType: "photo-folder", featureItemId: focused.id },
      featureItemId: focused.id,
    });
  }, [clientId, focusedPhoto, focusedPlainFile, folderPath, selectedNames.length, workflowRunId]);

  useEffect(() => {
    if (!folderPath) return;
    try {
      localStorage.setItem(`olivia-bridge:marks:${folderPath}`, JSON.stringify({ ratings, ratingEdits, colorLabels, excluded: [...excludedIds] }));
    } catch (error) {
      void error;
    }
  }, [colorLabels, excludedIds, folderPath, ratingEdits, ratings]);

  const loadDirectory = useCallback(async (
    directory: FileSystemDirectoryHandle,
    trail: Breadcrumb[],
    nestedJpgs = includeNestedJpgs,
  ) => {
    remoteLoadGenerationRef.current += 1;
    resetBridgeThumbnailCache();
    setRemoteLoadProgress(null);
    setExecutionMode("LOCAL_DIRECT");
    setScanStatus("loading");
    setScanError(undefined);
    setToolKey(undefined);
    setSceneReviewOpen(false);
    try {
      const snapshot = await loadLocalBridgeFolderSnapshot({
        directory,
        trail,
        includeNestedJpgs: nestedJpgs,
        storage: localStorage,
      });
      const nextPath = snapshot.folderPath;
      const nextSelectionSource = snapshot.selectionSource;
      const next = snapshot.scan;
      selectionSourceRef.current = nextSelectionSource;
      setSelectionSource(nextSelectionSource);
      const restoredMarks = snapshot.marks;
      setRatings(restoredMarks.ratings);
      setRatingEdits(restoredMarks.ratingEdits);
      setColorLabels(restoredMarks.colorLabels);
      setExcludedIds(restoredMarks.excludedIds);
      setScan(next);
      setRemoteFolder(null);
      setBreadcrumbs(trail);
      setRestoreTrail([]);
      setRestoreMessage("");
      manualSelectedIdsRef.current = new Set();
      adobeSelectedIdsRef.current = new Set();
      manualRemovedIdsRef.current = new Set();
      resetAdobeMarks();
      commitSelectedIds(new Set(), new Set(), nextSelectionSource);
      setAnchorId(null);
      setFocusedId(next.jpgs[0]?.id ?? null);
      setPreviewSize(undefined);
      setFileFilter("all");
      setCurrentLocalFolder(directory);
      setRawMatchFolderPath(nextPath);
      setRawMatchDefaultFolder(bridgeRawMatchDefaultFolder(trail));
      setRawMatchFolderCandidates(bridgeRawMatchFolderCandidates(trail));
      setJpgRatingsByName(snapshot.marksByName.ratings, { overwrite: true });
      setJpgColorLabelsByName(snapshot.marksByName.colorLabels, { overwrite: true });
      setScanStatus("ready");
      void saveBridgeFolderTrail(trail).catch((error) => {
        console.error("[olivia-bridge] Failed to remember the last folder", error);
      });
      rootRef.current?.focus();
    } catch (error) {
      console.error("[olivia-bridge] Failed to read local folder", error);
      setScanStatus("error");
      setScanError(error instanceof Error ? error.message : "폴더를 읽지 못했습니다.");
    }
  }, [commitSelectedIds, includeNestedJpgs, resetAdobeMarks, setCurrentLocalFolder, setExecutionMode, setJpgColorLabelsByName, setJpgRatingsByName, setRawMatchDefaultFolder, setRawMatchFolderCandidates, setRawMatchFolderPath]);

  const changeNestedJpgVisibility = useCallback((checked: boolean) => {
    setIncludeNestedJpgs(checked);
    if (!activeFolder || !breadcrumbs.length) return;
    void loadDirectory(activeFolder, breadcrumbs, checked);
  }, [activeFolder, breadcrumbs, loadDirectory]);

  const chooseFolder = useCallback(async () => {
    const directory = await picker.pick("readwrite");
    if (!directory) return;
    if (!desktopWindowMode) {
      navigate?.("/olivia-bridge", "Olivia Bridge", {
        clientId,
        projectId: workflowRunId,
        workflowRunId,
      });
    }
    await loadDirectory(directory, [{ name: directory.name, handle: directory }]);
  }, [clientId, desktopWindowMode, loadDirectory, navigate, picker, workflowRunId]);

  const openFolderSourceChooser = useCallback(() => {
    setFolderSourceOpen(true);
  }, []);

  const pickLocalFolder = useCallback(() => {
    setFolderSourceOpen(false);
    void chooseFolder();
  }, [chooseFolder]);

  const pickNasFolder = useCallback(() => {
    setFolderSourceOpen(false);
    setNasPickerOpen(true);
  }, []);

  const pickRawSearchRoot = useCallback(async () => {
    if (!activeFolder) return;
    const root = await picker.pick("readwrite", { startIn: activeFolder });
    if (!root) return;
    try {
      const trail = await resolveBridgeFolderTrail(root, activeFolder);
      if (!trail) {
        setRawRootPromptError(`고른 폴더 안에서 지금 열린 폴더(${activeFolderName || activeFolder.name})를 찾지 못했습니다.\n지금 폴더를 담고 있는 촬영 폴더를 골라 주세요. 같은 폴더라도 NAS 동기화 경로와 SSD 경로는 다른 폴더로 봅니다.`);
        return;
      }
      const current = trail.at(-1)?.handle ?? activeFolder;
      setBreadcrumbs(trail);
      setCurrentLocalFolder(current);
      setRawMatchFolderPath(trail.map((item) => item.name).join(" / "));
      setRawMatchDefaultFolder(bridgeRawMatchDefaultFolder(trail));
      setRawMatchFolderCandidates(bridgeRawMatchFolderCandidates(trail));
      setRawRootPromptOpen(false);
      setRawRootPromptError("");
      showTopNotice(`RAW 검색 범위: ${root.name}부터`);
      if (rawMatchOpenTimerRef.current) clearTimeout(rawMatchOpenTimerRef.current);
      rawMatchOpenTimerRef.current = setTimeout(() => {
        setToolKey("raw-match");
        rawMatchOpenTimerRef.current = null;
      }, 3_000);
      void saveBridgeFolderTrail(trail).catch((error) => {
        console.error("[olivia-bridge] Failed to remember the RAW search root", error);
      });
    } catch (error) {
      setRawRootPromptError(error instanceof Error ? error.message : "촬영 상위 폴더를 확인하지 못했습니다.");
    }
  }, [activeFolder, activeFolderName, picker, setCurrentLocalFolder, setRawMatchDefaultFolder, setRawMatchFolderCandidates, setRawMatchFolderPath, showTopNotice]);

  const openRawMatchWithCurrentScope = useCallback(() => {
    setRawRootPromptOpen(false);
    setRawRootPromptError("");
    setToolKey("raw-match");
  }, []);

  const loadRemoteDirectory = useCallback(async (selection: RemoteNasSelection) => {
    const generation = ++remoteLoadGenerationRef.current;
    resetBridgeThumbnailCache();
    setRemoteLoadProgress(null);
    setScanStatus("loading");
    setScanError(undefined);
    setToolKey(undefined);
    setSceneReviewOpen(false);
    setRemoteFolder(selection);
    const nextSelectionSource = readBridgeFolderSelectionSource(localStorage, selection.path);
    selectionSourceRef.current = nextSelectionSource;
    setSelectionSource(nextSelectionSource);
    setScan(EMPTY_SCAN);
    setBreadcrumbs([]);
    setCurrentLocalFolder(null);
    setRawMatchFolderPath(selection.path);
    manualSelectedIdsRef.current = new Set();
    adobeSelectedIdsRef.current = new Set();
    manualRemovedIdsRef.current = new Set();
    commitSelectedIds(new Set(), new Set(), nextSelectionSource);
    setAnchorId(null);
    setFocusedId(null);
    setPreviewSize(undefined);
    setRatings({});
    resetAdobeMarks();
    setRatingEdits({});
    setColorLabels({});
    setExcludedIds(new Set());
    try {
      const snapshot = await loadRemoteBridgeFolderSnapshot({
        selection,
        storage: localStorage,
        selectionSource: nextSelectionSource,
        onProgress: (progress) => {
          if (generation !== remoteLoadGenerationRef.current) return;
          setScan({ ...EMPTY_SCAN, jpgs: progress.jpgs });
          setRemoteLoadProgress({ received: progress.received, total: progress.total });
          setFocusedId((current) => current ?? progress.jpgs[0]?.id ?? null);
        },
      });
      if (generation !== remoteLoadGenerationRef.current) return;
      const jpgs = snapshot.jpgs;
      setScan({ ...EMPTY_SCAN, jpgs });
      lastPublishedRatingsRef.current = {};
      setJpgRatingsByName(projectBridgeRatingsByName(jpgs, {}), { overwrite: true });
      setJpgColorLabelsByName(projectBridgeColorLabelsByName(jpgs, {}), { overwrite: true });
      setFocusedId(jpgs[0]?.id ?? null);
      setScanStatus("ready");
      setRemoteLoadProgress(null);
      rootRef.current?.focus();
    } catch (error) {
      if (generation !== remoteLoadGenerationRef.current) return;
      console.error("[olivia-bridge] Failed to read remote folder", error);
      setScanStatus("error");
      setRemoteLoadProgress(null);
      setScanError(error instanceof Error ? error.message : "원격 썸네일을 읽지 못했습니다.");
    }
  }, [commitSelectedIds, resetAdobeMarks, setCurrentLocalFolder, setJpgColorLabelsByName, setJpgRatingsByName, setRawMatchFolderPath]);

  const remoteFolderQuery = useMemo(() => {
    if (!routeHref) return sp.get("remoteFolder");
    try {
      return new URL(routeHref, "https://olivia.local").searchParams.get("remoteFolder");
    } catch {
      return null;
    }
  }, [routeHref, sp]);
  const restoreLastFolder = useOliviaBridgeFolderRestore({
    remoteFolderQuery,
    restoreTrail,
    setRestoreTrail,
    setRestoreMessage,
    setScanStatus,
    setExecutionMode,
    loadDirectory,
    loadRemoteDirectory,
  });

  useEffect(() => {
    const openInspector = () => {
      setPreviewTab("selection");
      setCompactPreviewOpen(true);
    };
    window.addEventListener("olivia-bridge-open-inspector", openInspector);
    return () => window.removeEventListener("olivia-bridge-open-inspector", openInspector);
  }, []);

  const {
    moveFocus,
    moveGridFocus,
    selectAllVisibleJpgs,
    handleFileAreaClick,
    handleFileAreaContextMenu,
  } = useOliviaBridgePhotoNavigation({
    visibleJpgs,
    visiblePhotoById,
    selectedIds,
    anchorId,
    focusedId,
    focusedIndex,
    fileAreaRef,
    suppressThumbnailClickRef,
    selectionSourceRef,
    setSelectedIds,
    setAnchorId,
    setFocusedId,
    setFocusedPlainId,
    setPreviewSize,
    showAdobeSelectionNotice,
  });

  const closeFullscreenPreview = useCallback(() => {
    setFullscreenPreviewOpen(false);
    requestAnimationFrame(() => rootRef.current?.focus());
  }, []);

  const openFullscreenPreview = useCallback(() => {
    if (selectionReviewOpen ? !reviewActivePhoto : !focusedPhoto || focusedIndex < 0) return;
    setFullscreenPreviewOpen(true);
  }, [focusedIndex, focusedPhoto, reviewActivePhoto, selectionReviewOpen]);

  const moveFullscreenPreview = useCallback((delta: number) => {
    if (selectionReviewOpen) moveReview(delta < 0 ? -1 : 1);
    else moveFocus(delta);
  }, [moveFocus, moveReview, selectionReviewOpen]);

  const applyLabelFilterCommand = useCallback((command: BridgeLabelFilterCommand) => {
    if (fullscreenPreviewOpen) closeFullscreenPreview();
    if (command.kind === "all") {
      setLabelFilters({ ...EMPTY_BRIDGE_LABEL_FILTERS });
      setFileFilter("all");
      setComparisonFilter("all");
      setQualityFilter("all");
      return;
    }
    setLabelFilters((current) => updateBridgeLabelFilters(current, command));
    setFileFilter("jpg");
  }, [closeFullscreenPreview, fullscreenPreviewOpen]);

  const chooseFileFilter = useCallback((filter: FileFilter) => {
    setLabelFilters({ ...EMPTY_BRIDGE_LABEL_FILTERS });
    setFileFilter(filter);
  }, []);

  const handleSearchFilterShortcut = useBridgeSearchFilterShortcuts({
    searchInputRef,
    searchQuery: filenameSearch,
    onSearchQueryChange: setFilenameSearch,
    onFilterCommand: applyLabelFilterCommand,
  });

  useEffect(() => {
    const handleUnfocusedBridgeShortcut = (event: KeyboardEvent) => {
      if (event.target !== document.body && event.target !== document.documentElement) return;
      handleSearchFilterShortcut(event);
    };
    window.addEventListener("keydown", handleUnfocusedBridgeShortcut);
    return () => window.removeEventListener("keydown", handleUnfocusedBridgeShortcut);
  }, [handleSearchFilterShortcut]);

  const resizeThumbnails = useCallback((direction: -1 | 1) => {
    setThumbnailSize((value) => Math.min(
      THUMBNAIL_SIZE_MAX,
      Math.max(THUMBNAIL_SIZE_MIN, value + (direction * THUMBNAIL_SIZE_STEP)),
    ));
  }, []);

  const closeCompactFilters = useCallback(() => {
    setCompactFiltersOpen(false);
    window.requestAnimationFrame(() => compactFilterButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!compactFiltersOpen) return;
    folderPanelRef.current?.focus();
  }, [compactFiltersOpen]);

  const closeDialogs = useCallback(() => {
    setFolderSourceOpen(false);
    setNasPickerOpen(false);
    closePersonSelectImport();
    closeGallerySelectImport();
    setRawRootPromptOpen(false);
    rootRef.current?.focus();
  }, [closeGallerySelectImport, closePersonSelectImport]);
  const closeSceneReview = useCallback(() => setSceneReviewOpen(false), []);
  const closeTool = useCallback(() => setToolKey(undefined), []);

  const handleKeyboard = useOliviaBridgeKeyboard({
    compactFiltersOpen,
    closeCompactFilters,
    dialogOpen: folderSourceOpen || nasPickerOpen || personSelectDialogOpen || gallerySelectDialogOpen || rawRootPromptOpen,
    closeDialogs,
    handleSearchFilterShortcut,
    resizeThumbnails,
    toolKey,
    sceneReviewOpen,
    selectionReviewOpen,
    fullscreenPreviewOpen,
    openSelectionReview,
    closeSelectionReview,
    closeFullscreenPreview,
    moveFullscreenPreview,
    moveReview,
    removeReviewPhoto,
    restoreReviewPhoto,
    openFullscreenPreview,
    applyRating,
    applyColorLabel,
    toggleExcluded,
    closeSceneReview,
    closeTool,
    selectAllVisibleJpgs,
    moveGridFocus,
  });

  const openTool = useCallback((key: ToolKey) => {
    if (!currentLocalFolder && !(remoteFolder && key === "classification")) return;
    const toolSelection = resolveBridgeToolSelection(selectedIdsRef.current, visibleJpgs.map((photo) => photo.id));
    if (!toolSelection.size) return;
    if (!selectedIdsRef.current.size) {
      setSelectedIds(toolSelection);
      setSelectedJpgFiles(projectBridgeSelectedFiles(visibleJpgs, toolSelection));
    }
    setSceneReviewOpen(false);
    if (key === "classification") {
      setToolKey(undefined);
      setSceneReviewOpen(true);
      void syncAdobeBridgeSelection();
      return;
    }
    if (key === "raw-match" && breadcrumbs.length < 3) {
      setRawRootPromptError("");
      setRawRootPromptOpen(true);
      return;
    }
    setToolKey(key);
  }, [breadcrumbs.length, currentLocalFolder, remoteFolder, setSelectedIds, setSelectedJpgFiles, syncAdobeBridgeSelection, visibleJpgs]);

  const toolDisabledReason = useCallback((key: ToolKey) => {
    if (scanStatus !== "ready") return "사진 폴더를 먼저 선택해 주세요.";
    if (!selectedIds.size && !visibleJpgs.length) return "현재 화면에 작업할 JPG가 없습니다.";
    if (activeFolder) return undefined;
    if (remoteFolder && key === "classification") return undefined;
    if (remoteFolder) return "이 도구는 현재 로컬 폴더에서만 실행할 수 있습니다.";
    return "사진 폴더를 먼저 선택해 주세요.";
  }, [activeFolder, remoteFolder, scanStatus, selectedIds.size, visibleJpgs.length]);

  const addCustomerSelectionToAdminSelection = useCallback(() => {
    if (!customerSelectedIds.size) return;
    setSelectedIds((current) => new Set([...current, ...customerSelectedIds]));
    setComparisonFilter("all");
  }, [customerSelectedIds, setSelectedIds]);

  const currentAdobeSelectedIds = adobeSelectedIdsRef.current;
  const currentManualSelectedIds = manualSelectedIdsRef.current;
  const {
    selectionCounts,
    labeledCount,
    selectedPhotos,
    adobeSelectedCount,
    manualSelectedCount,
    commonSelectedRating,
    commonSelectedColor,
    selectedRatingMixed,
    selectedColorMixed,
    allSelectedExcluded,
  } = useMemo(() => createBridgeSelectionSummary({
    jpgs: scan.jpgs,
    selectedIds,
    ratings: effectiveRatings,
    colorLabels: effectiveColorLabels,
    excludedIds,
    selectionSource,
    adobeSelectedIds: currentAdobeSelectedIds,
    manualSelectedIds: currentManualSelectedIds,
  }), [currentAdobeSelectedIds, currentManualSelectedIds, effectiveColorLabels, effectiveRatings, excludedIds, scan.jpgs, selectedIds, selectionSource]);
  const fullscreenPhoto = selectionReviewOpen ? reviewActivePhoto : focusedPhoto;
  const fullscreenIndex = selectionReviewOpen ? reviewActiveIndex : focusedIndex;
  const fullscreenTotal = selectionReviewOpen ? reviewPhotos.length : visibleJpgs.length;
  const activeRatingFilterName = labelFilters.rating === null
    ? null
    : bridgeLabelFilterName({ kind: "rating", rating: labelFilters.rating });
  const activeColorFilterName = labelFilters.color === null
    ? null
    : bridgeLabelFilterName({ kind: "color", label: labelFilters.color });
  const fileFilters: Array<{ key: FileFilter; label: string; count: number }> = [
    { key: "all", label: "모든 파일", count: scan.jpgs.length + scan.raws.length + scan.sidecars.length },
    { key: "jpg", label: "JPG", count: scan.jpgs.length },
    { key: "raw", label: "RAW", count: scan.raws.length },
    { key: "sidecar", label: "사이드카", count: scan.sidecars.length },
    { key: "excluded", label: "제외", count: excludedIds.size },
  ];
  const selectionFilters: Array<{ key: FileFilter; label: string; count: number }> = [
    { key: "starred", label: "별 셀렉 사진만 보기", count: selectionCounts.starred },
    { key: "colored", label: "컬러 셀렉 사진만 보기", count: selectionCounts.colored },
    { key: "selected", label: "모든 셀렉 사진만 보기", count: labeledCount },
    { key: "unselected", label: "셀렉 사진 제외하고 보기", count: selectionCounts.unselected },
  ];
  const scenePhotoByName = useMemo(() => new Map(scan.jpgs.map((photo) => [photo.name, photo])), [scan.jpgs]);
  const selectedSceneAnalysis = useMemo(() => {
    if (!sceneReviewOpen || !sceneState.analysis || !selectedIds.size) return null;
    return rebuildBridgeSceneAnalysis(sceneState.analysis.files.filter((file) => selectedIds.has(file.id)));
  }, [sceneReviewOpen, sceneState.analysis, selectedIds]);
  const selectedScenes = useMemo(() => selectedSceneAnalysis?.scenes ?? [], [selectedSceneAnalysis]);
  const sceneBoundaryReviewCount = useMemo(() => selectedScenes.filter((scene) => scene.needsReview).length, [selectedScenes]);
  const centerFileCount = visibleJpgs.length + (showRaws ? scan.raws.length : 0) + (showSidecars ? scan.sidecars.length : 0);
  const sceneAnalysisReady = sceneState.status === "complete" && Boolean(sceneState.analysis);
  const selectedSceneAnalysisReady = sceneAnalysisReady && Boolean(selectedSceneAnalysis) && selectedScenes.length > 0;
  const scenePlanReady = selectedSceneAnalysisReady && photoDepartmentResolution.status === "resolved" && !departmentLoading && !adobeSelectionLoading;

  const closeCompactPreview = useCallback(() => setCompactPreviewOpen(false), []);
  const openRootFolder = useCallback(() => {
    const root = breadcrumbs[0];
    if (root) void loadDirectory(root.handle, breadcrumbs.slice(0, 1));
  }, [breadcrumbs, loadDirectory]);
  const openChildFolder = useCallback((folder: FileSystemDirectoryHandle) => {
    void loadDirectory(folder, [...breadcrumbs, { name: folder.name, handle: folder }]);
  }, [breadcrumbs, loadDirectory]);
  const toggleFocusedSelection = useCallback(() => {
    if (!focusedPhoto) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(focusedPhoto.id)) next.delete(focusedPhoto.id);
      else next.add(focusedPhoto.id);
      return next;
    });
  }, [focusedPhoto, setSelectedIds]);

  const applyScenePlan = useCallback(() => {
    if (!hasActiveFolder || !selectedSceneAnalysis || !scenePlanReady || photoDepartmentResolution.status !== "resolved") return;
    try {
      if (activeFolder) {
        stageBridgeClassificationPlan(createBridgeClassificationPlan({
          folderKey: folderPath,
          folderName: activeFolder.name,
          directory: activeFolder,
          analysis: selectedSceneAnalysis,
          departmentResolution: photoDepartmentResolution,
        }));
      }
      setSceneReviewOpen(false);
      setToolKey("classification");
    } catch (error) {
      reportScenePlanError(error);
    }
  }, [activeFolder, folderPath, hasActiveFolder, photoDepartmentResolution, reportScenePlanError, scenePlanReady, selectedSceneAnalysis, stageBridgeClassificationPlan]);

  const openCompactPreview = useCallback(() => setCompactPreviewOpen(true), []);
  const clearFilenameSearch = useCallback(() => {
    setFilenameSearch("");
    searchInputRef.current?.focus();
  }, []);
  const restoreBrowserFolder = useCallback(() => {
    void restoreLastFolder();
  }, [restoreLastFolder]);
  const focusPlainFile = useCallback((fileId: string) => {
    setFocusedPlainId(fileId);
    setFocusedId(null);
  }, []);
  const handleFileAreaClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressThumbnailClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);
  return (
    <div ref={rootRef} className={styles.bridge} data-desktop-ui={desktopWindowMode ? "true" : "false"} tabIndex={0} onKeyDown={handleKeyboard} aria-label="Olivia Bridge 사진 작업공간">
      <header className={styles.bridgeBar}>
        <strong>Bridge</strong>
        <div className={styles.bridgeHeaderStatus}>
          {hasActiveFolder ? <button type="button" className={`${styles.sceneStatusButton} ${sceneState.status === "complete" ? styles.sceneReady : sceneState.status === "error" ? styles.sceneFailed : ""}`} onClick={() => { setSceneReviewOpen(true); void syncAdobeBridgeSelection(); }} aria-label={sceneState.stage} title={sceneState.stage}>
            {sceneState.status === "running" ? <LoaderCircle className={styles.spin} size={15} /> : sceneState.status === "error" ? <CircleAlert size={15} /> : <Sparkles size={15} />}
            <span>{sceneState.status === "running" ? `${sceneState.completed}/${sceneState.total}` : sceneState.stage}</span>
          </button> : null}
          <span className={styles.connectionState}><i />{remoteFolder ? "NAS 연결" : activeFolder ? "Mac 연결" : "폴더 미연결"}</span>
          <button type="button" className={styles.oliviaEntry} onClick={() => { setPreviewTab("olivia"); setCompactPreviewOpen(true); }}>Olivia</button>
        </div>
      </header>

      <div className={styles.pathBar}>
        <button type="button" className={styles.folderPickerButton} onClick={(event) => { event.stopPropagation(); openFolderSourceChooser(); }} aria-haspopup="dialog" aria-expanded={folderSourceOpen}><FolderOpen size={17} /> {hasActiveFolder ? "폴더 바꾸기" : "폴더 선택"}</button>
        <div className={styles.selectionSourceControl} role="group" aria-label="셀렉 기준">
          <span>셀렉 기준</span>
          {(["olivia", "adobe", "both"] as const).map((source) => <button key={source} type="button" data-active={selectionSource === source ? "true" : undefined} aria-pressed={selectionSource === source} onClick={() => changeSelectionSource(source)}>{source === "olivia" ? "올리비아" : source === "adobe" ? "어도비" : "둘 다"}</button>)}
        </div>
        {selectionSource !== "olivia" ? <div
          className={styles.adobeMarkStatus}
          title={adobeMarkStatus.failedFileNames.length ? `실패: ${adobeMarkStatus.failedFileNames.join(", ")}${adobeMarkStatus.firstError ? ` · ${adobeMarkStatus.firstError}` : ""}` : undefined}
        >
          <span>{adobeSelectionLoading
            ? `어도비 별점 읽는 중… ${(adobeMarkStatus.read + adobeMarkStatus.failed).toLocaleString("ko-KR")}/${adobeMarkStatus.total.toLocaleString("ko-KR")}`
            : `어도비 별점 ${adobeMarkStatus.rated.toLocaleString("ko-KR")}장 · 컬러 ${adobeMarkStatus.colored.toLocaleString("ko-KR")}장`}</span>
          {adobeMarkStatus.failed ? <b>실패 {adobeMarkStatus.failed.toLocaleString("ko-KR")}장</b> : null}
          <button type="button" disabled={adobeSelectionLoading} onClick={() => void syncAdobeBridgeSelection()}>다시 읽기</button>
        </div> : null}
        <div className={styles.breadcrumbs} aria-label="현재 폴더 경로">
          {remoteFolder ? <span>NAS · {remoteFolder.displayPath}</span> : breadcrumbs.length ? breadcrumbs.map((item, index) => (
            <span key={`${item.name}-${index}`}>{index ? <ChevronRight size={12} /> : null}<button type="button" onClick={() => void loadDirectory(item.handle, breadcrumbs.slice(0, index + 1))}>{item.name}</button></span>
          )) : <span>작업할 촬영 폴더를 선택해 주세요.</span>}
        </div>
        <label className={styles.nestedJpgPathToggle}><input type="checkbox" checked={includeNestedJpgs} disabled={!activeFolder || scanStatus === "loading"} onChange={(event) => changeNestedJpgVisibility(event.currentTarget.checked)} /><span>하위 폴더 JPG 포함</span></label>
        <span className={styles.fileCountSummary}>보이는 중 {centerFileCount.toLocaleString("ko-KR")} · 전체 {(scan.jpgs.length + scan.raws.length + scan.sidecars.length).toLocaleString("ko-KR")}장</span>
        <button ref={compactFilterButtonRef} type="button" className={styles.compactFilterEntry} aria-expanded={compactFiltersOpen} aria-controls="olivia-bridge-folder-panel" onClick={() => setCompactFiltersOpen(true)}><SlidersHorizontal size={14} /> 필터</button>
        <button type="button" className={styles.compactInspectorEntry} onClick={() => { setPreviewTab("selection"); setCompactPreviewOpen(true); }}><Check size={14} /> 선택한 파일</button>
        {topNotice ? <span className={styles.topNotice} role="status">{topNotice}</span> : null}
      </div>

      <main ref={workspaceRef} className={styles.workspace} data-compact-preview={compactPreviewOpen ? "true" : "false"}>
        {compactFiltersOpen ? <button type="button" className={styles.compactFilterBackdrop} aria-label="필터 닫기" onClick={closeCompactFilters} /> : null}
        <OliviaBridgeFolderPanel
          panelRef={folderPanelRef}
          compactOpen={compactFiltersOpen}
          onCloseCompact={closeCompactFilters}
          rootName={breadcrumbs[0]?.name ?? "촬영 폴더"}
          rootCount={scan.jpgs.length + scan.raws.length + scan.sidecars.length}
          canOpenRoot={Boolean(breadcrumbs[0])}
          onOpenRoot={openRootFolder}
          includeNestedJpgs={includeNestedJpgs}
          canToggleNestedJpgs={Boolean(activeFolder) && scanStatus !== "loading"}
          nestedJpgCount={scan.nestedJpgCount}
          onNestedJpgsChange={changeNestedJpgVisibility}
          fileFilters={fileFilters}
          selectionFilters={selectionFilters}
          fileFilter={fileFilter}
          hasLabelFilters={hasLabelFilters}
          onChooseFileFilter={chooseFileFilter}
          galleryTitle={galleryCustomerResult?.gallery.title}
          hasCustomerComparison={Boolean(galleryCustomerResult)}
          comparisonCounts={comparisonCounts}
          comparisonFilter={comparisonFilter}
          onComparisonFilterChange={setComparisonFilter}
          hasLinkedQuality={Boolean(galleryCustomerResult?.personSelectEventId)}
          jpgCount={scan.jpgs.length}
          qualityCounts={qualityCounts}
          qualityFilter={qualityFilter}
          onQualityFilterChange={setQualityFilter}
          qualityJob={qualityJob}
          qualityMessage={qualityMessage}
          onStartQuality={startLinkedQualityAnalysis}
          onControlQuality={controlLinkedQualityAnalysis}
          folders={scan.folders}
          folderImageCounts={folderImageCounts}
          hasActiveFolder={Boolean(activeFolder)}
          onOpenFolder={openChildFolder}
          selectedCount={selectedIds.size}
          labeledCount={labeledCount}
          excludedCount={excludedIds.size}
          thumbnailSize={thumbnailSize}
          thumbnailMin={THUMBNAIL_SIZE_MIN}
          thumbnailMax={THUMBNAIL_SIZE_MAX}
          thumbnailStep={THUMBNAIL_SIZE_STEP}
          onThumbnailSizeChange={setThumbnailSize}
        />

        <BridgePaneDivider
          pane="folder"
          workspaceRef={workspaceRef}
          oppositePaneRef={previewPanelRef}
          controls="olivia-bridge-folder-panel"
          label="폴더 영역 너비 조절"
        />

        <OliviaBridgeBrowserPanel
          activeFolderName={activeFolder?.name}
          filenameSearch={filenameSearch}
          filenameSearchActive={filenameSearchTokens.length > 0}
          searchInputRef={searchInputRef}
          visibleJpgs={visibleJpgs}
          centerFileCount={centerFileCount}
          scan={scan}
          scanStatus={scanStatus}
          loadProgress={remoteLoadProgress}
          restoreTrailAvailable={restoreTrail.length > 0}
          restoreMessage={restoreMessage}
          activeRatingFilterName={activeRatingFilterName}
          activeColorFilterName={activeColorFilterName}
          labelFilters={labelFilters}
          jpgSortMode={jpgSortMode}
          captureMetadataState={captureMetadataState}
          thumbnailSize={thumbnailSize}
          selectedIds={selectedIds}
          customerSelectedIds={customerSelectedIds}
          customerRatings={customerRatings}
          focusedId={focusedId}
          focusedPlainId={focusedPlainFile?.id ?? null}
          selectionSource={selectionSource}
          adobeSelectedIds={adobeSelectedIdsRef.current}
          manualSelectedIds={manualSelectedIdsRef.current}
          excludedIds={excludedIds}
          effectiveRatings={effectiveRatings}
          effectiveColorLabels={effectiveColorLabels}
          qualityByBridgeId={qualityByBridgeId}
          rawMarkByFileKey={rawMarkByFileKey}
          rawAdobeMarks={rawAdobeMarks}
          showRaws={showRaws}
          showSidecars={showSidecars}
          fileAreaRef={fileAreaRef}
          marqueeRef={marqueeRef}
          onApplyLabelFilterCommand={applyLabelFilterCommand}
          onSortModeChange={setJpgSortMode}
          onOpenPreview={openCompactPreview}
          onFilenameSearchChange={setFilenameSearch}
          onClearFilenameSearch={clearFilenameSearch}
          onResizeThumbnails={resizeThumbnails}
          onRestoreLastFolder={restoreBrowserFolder}
          onFileAreaClickCapture={handleFileAreaClickCapture}
          onFileAreaClick={handleFileAreaClick}
          onFileAreaContextMenu={handleFileAreaContextMenu}
          onFileAreaPointerDown={handleFileAreaPointerDown}
          onFileAreaPointerMove={handleFileAreaPointerMove}
          onFileAreaPointerUp={handleFileAreaPointerUp}
          onFileAreaPointerCancel={handleFileAreaPointerCancel}
          onFocusPlainFile={focusPlainFile}
        />


        <BridgePaneDivider
          pane="preview"
          workspaceRef={workspaceRef}
          oppositePaneRef={folderPanelRef}
          controls="olivia-bridge-preview-panel"
          label="미리보기 영역 너비 조절"
        />

        <OliviaBridgePreviewPanel
          panelRef={previewPanelRef}
          previewTab={previewTab}
          onPreviewTabChange={setPreviewTab}
          onCloseCompact={closeCompactPreview}
          selectedCount={selectedPhotos.length}
          selectionSource={selectionSource}
          lastFocusedName={focusedPhoto?.name ?? focusedPlainFile?.name ?? "없음"}
          adobeSelectedCount={adobeSelectedCount}
          manualSelectedCount={manualSelectedCount}
          focusedPhoto={focusedPhoto}
          focusedPlainFile={focusedPlainFile}
          customerSelected={Boolean(focusedPhoto && customerSelectedIds.has(focusedPhoto.id))}
          customerRating={focusedPhoto ? customerRatings[focusedPhoto.id] ?? 0 : 0}
          customerNote={focusedPhoto ? customerNotes[focusedPhoto.id] ?? "" : ""}
          quality={focusedPhoto ? qualityByBridgeId[focusedPhoto.id] : undefined}
          selectedRatingMixed={selectedRatingMixed}
          commonSelectedRating={commonSelectedRating}
          onApplyRating={applyRating}
          selectedColorMixed={selectedColorMixed}
          commonSelectedColor={commonSelectedColor}
          onApplyColorLabel={applyColorLabel}
          onClearColorLabels={clearColorLabels}
          allSelectedExcluded={allSelectedExcluded}
          onToggleExcluded={toggleExcluded}
          onOpenFullscreen={openFullscreenPreview}
          folderPath={folderPath}
          selectedNamesCount={selectedNames.length}
          focusedIndex={focusedIndex}
          visibleCount={visibleJpgs.length}
          onMoveFocus={moveFocus}
          previewSize={previewSize}
          onPreviewSize={setPreviewSize}
          focusedRating={focusedPhoto ? effectiveRatings[focusedPhoto.id] ?? 0 : 0}
          focusedSelected={Boolean(focusedPhoto && selectedIds.has(focusedPhoto.id))}
          onToggleFocusedSelection={toggleFocusedSelection}
        />
      </main>

      <OliviaBridgeActionBar
        selectedCount={selectedIds.size}
        labeledCount={labeledCount}
        excludedCount={excludedIds.size}
        activeToolKey={toolKey}
        sceneReviewOpen={sceneReviewOpen}
        disabledReasonFor={toolDisabledReason}
        onOpenTool={openTool}
        hasActiveFolder={hasActiveFolder}
        scanReady={scanStatus === "ready"}
        onOpenGallerySelection={openGallerySelectImport}
        onOpenPersonSelection={openPersonSelectImport}
        activeRatingFilterName={activeRatingFilterName}
        activeColorFilterName={activeColorFilterName}
        unreadableFolderCount={scan.unreadableFolderCount}
        ignoredCount={scan.ignoredCount}
      />

      {sceneReviewOpen ? <BridgeFloatingWindow
        windowId="scene-review"
        variant="scene"
        title="AI Scene 분류 검토"
        subtitle={adobeSelectionLoading ? "Adobe Bridge 선택 동기화 중" : sceneState.stage}
        ariaLabel="AI Scene 분류 검토"
        containerRef={rootRef}
        rect={floatingWindowRectsRef.current["scene-review"]}
        onRectChange={(rect) => updateFloatingWindowRect("scene-review", rect)}
        onClose={() => setSceneReviewOpen(false)}
      >
        <OliviaBridgeSceneReviewContent
          sceneState={sceneState}
          adobeSelectionLoading={adobeSelectionLoading}
          departmentLoading={departmentLoading}
          departmentError={departmentError}
          departmentPickerOpen={departmentPickerOpen}
          departmentResolution={photoDepartmentResolution}
          selectedScenes={selectedScenes}
          scenePhotoByName={scenePhotoByName}
          selectedFileCount={selectedSceneAnalysis?.files.length ?? 0}
          boundaryReviewCount={sceneBoundaryReviewCount}
          selectedSceneAnalysisReady={selectedSceneAnalysisReady}
          scenePlanReady={scenePlanReady}
          onRetry={retrySceneAnalysis}
          onOpenDepartmentPicker={openDepartmentPicker}
          onChooseDepartment={chooseDepartment}
          onApplyScenePlan={applyScenePlan}
        />
      </BridgeFloatingWindow> : null}

      {activeTool ? <BridgeFloatingWindow
        key={activeTool.key}
        windowId={`tool-${activeTool.key}`}
        variant="tool"
        title={activeTool.label}
        subtitle={`${activeFolderName} · 선택 JPG ${selectedNames.length}장`}
        ariaLabel={`${activeTool.label} 도구`}
        containerRef={rootRef}
        rect={floatingWindowRectsRef.current[`tool-${activeTool.key}`]}
        onRectChange={(rect) => updateFloatingWindowRect(`tool-${activeTool.key}`, rect)}
        onClose={() => setToolKey(undefined)}
      ><div className={styles.toolBody}><EmbeddedPhotoTool mode={activeTool.mode} selectMode={activeTool.selectMode} fileOpsMode={activeTool.fileOpsMode} clientId={clientId} workflowRunId={workflowRunId} initialRemoteSelection={remoteProjectSelection} /></div></BridgeFloatingWindow> : null}

      {selectionReviewOpen ? <BridgeSelectionReview
        photos={reviewPhotos}
        activeId={resolvedReviewActiveId}
        rating={reviewActivePhoto ? effectiveRatings[reviewActivePhoto.id] ?? 0 : 0}
        colorLabel={reviewActivePhoto ? effectiveColorLabels[reviewActivePhoto.id] : undefined}
        excluded={Boolean(reviewActivePhoto && excludedIds.has(reviewActivePhoto.id))}
        removedCount={reviewRemoved.length}
        onFocus={focusReviewPhoto}
        onMove={moveReview}
        onRemove={removeReviewPhoto}
        onRestore={restoreReviewPhoto}
        onOpenFullscreen={openFullscreenPreview}
        onClose={closeSelectionReview}
      /> : null}

      {fullscreenPreviewOpen && fullscreenPhoto ? (
        <BridgeFullscreenPreview
          photo={fullscreenPhoto}
          position={fullscreenIndex + 1}
          total={fullscreenTotal}
          rating={effectiveRatings[fullscreenPhoto.id] ?? 0}
          colorLabel={effectiveColorLabels[fullscreenPhoto.id]}
          canMovePrevious={selectionReviewOpen ? fullscreenTotal > 1 : fullscreenIndex > 0}
          canMoveNext={selectionReviewOpen ? fullscreenTotal > 1 : fullscreenIndex >= 0 && fullscreenIndex < fullscreenTotal - 1}
          onMove={moveFullscreenPreview}
          onClose={closeFullscreenPreview}
        />
      ) : null}

      {folderSourceOpen ? <BridgeFolderSourceDialog
        onClose={() => setFolderSourceOpen(false)}
        onPickLocal={pickLocalFolder}
        onPickNas={pickNasFolder}
      /> : null}

      {gallerySelectDialogOpen ? <BridgeGallerySelectionDialog
        result={galleryCustomerResult}
        loading={selectGalleriesLoading}
        error={gallerySelectError}
        galleries={selectGalleries}
        sharedProjects={sharedSelectProjects}
        importingId={gallerySelectImportingId}
        onClose={closeGallerySelectImport}
        onAddToAdmin={addCustomerSelectionToAdminSelection}
        onChooseAnother={chooseAnotherGallerySelection}
        onRetry={() => void loadSelectGalleries()}
        onImportGallery={(gallery) => void importGalleryCustomerSelection(gallery)}
        onImportShared={(project) => void importSharedProjectSelection(project)}
      /> : null}

      {personSelectDialogOpen ? <BridgePersonSelectionDialog
        result={personSelectResult}
        loading={personSelectEventsLoading}
        error={personSelectError}
        events={personSelectEvents}
        importingId={personSelectImportingId}
        onClose={closePersonSelectImport}
        onChooseAnother={chooseAnotherPersonSelect}
        onRetry={() => void loadPersonSelectEvents()}
        onImport={(event) => void importPersonSelectEvent(event)}
      /> : null}

      {rawRootPromptOpen ? <BridgeRawRootPromptDialog
        error={rawRootPromptError}
        onClose={() => setRawRootPromptOpen(false)}
        onPickRoot={() => void pickRawSearchRoot()}
        onUseCurrent={openRawMatchWithCurrentScope}
      /> : null}

      {nasPickerOpen ? (
        <PhotoSourcePicker
          sourceScope="person-select"
          onCancel={() => {
            setNasPickerOpen(false);
            rootRef.current?.focus();
          }}
          onSelectRemote={(selection) => {
            setNasPickerOpen(false);
            setExecutionMode("REMOTE_WORKER");
            void loadRemoteDirectory(selection);
          }}
        />
      ) : null}

    </div>
  );
}
