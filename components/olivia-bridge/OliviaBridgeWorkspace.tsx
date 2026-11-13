"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import { BridgePaneDivider } from "@/components/olivia-bridge/OliviaBridgePaneDivider";
import {
  BRIDGE_TOOL_ITEMS,
  OliviaBridgeActionBar,
  type BridgeToolKey as ToolKey,
} from "@/components/olivia-bridge/OliviaBridgeActionBar";
import {
  OliviaBridgeFolderPanel,
} from "@/components/olivia-bridge/OliviaBridgeFolderPanel";
import { OliviaBridgePreviewPanel } from "@/components/olivia-bridge/OliviaBridgePreviewPanel";
import { OliviaBridgeBrowserPanel } from "@/components/olivia-bridge/OliviaBridgeBrowserPanel";
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
import { useOliviaBridgeSelectionState } from "@/components/olivia-bridge/useOliviaBridgeSelectionState";
import { useOliviaBridgeFolderLoading } from "@/components/olivia-bridge/useOliviaBridgeFolderLoading";
import { useOliviaBridgeFolderActions } from "@/components/olivia-bridge/useOliviaBridgeFolderActions";
import { useOliviaBridgeToolLaunch } from "@/components/olivia-bridge/useOliviaBridgeToolLaunch";
import { useOliviaBridgeWorkspaceSync } from "@/components/olivia-bridge/useOliviaBridgeWorkspaceSync";
import { useOliviaBridgeFilters } from "@/components/olivia-bridge/useOliviaBridgeFilters";
import { useOliviaBridgeSceneReviewModel } from "@/components/olivia-bridge/useOliviaBridgeSceneReviewModel";
import { useOliviaBridgeSelectionSummary } from "@/components/olivia-bridge/useOliviaBridgeSelectionSummary";
import { useOliviaBridgeUiState } from "@/components/olivia-bridge/useOliviaBridgeUiState";
import { useOliviaBridgeFolderNavigation } from "@/components/olivia-bridge/useOliviaBridgeFolderNavigation";
import { useOliviaBridgePreviewNavigation } from "@/components/olivia-bridge/useOliviaBridgePreviewNavigation";
import {
  useOliviaBridgeEffectiveMarks,
  useOliviaBridgeRatingPublisher,
} from "@/components/olivia-bridge/useOliviaBridgeMarkSync";
import { OliviaBridgeOverlayLayer } from "@/components/olivia-bridge/OliviaBridgeOverlayLayer";
import { OliviaBridgeTopBars } from "@/components/olivia-bridge/OliviaBridgeTopBars";
import {
  type BridgeFolderScan,
  type BridgeJpgSortMode,
} from "@/lib/photo-bridge/bridgeFiles";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import {
  normalizePhotoToolFileKey,
  type BridgeSelectionSource,
} from "@/lib/photo-bridge/toolLinkage";
import {
  type BridgeFolderTrailItem,
} from "@/lib/photo-bridge/recentFolder";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { useDesktopWindowMode, useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import styles from "./OliviaBridgeWorkspace.module.css";

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
  const { routeHref } = useDesktopWindowRoute();
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
  const {
    selectedIds,
    selectedIdsRef,
    manualSelectedIdsRef,
    adobeSelectedIdsRef,
    selectionSource,
    selectionSourceRef,
    commitSelectedIds,
    setSelectedIds,
    activateSelectionSource,
    resetSelectionState,
  } = useOliviaBridgeSelectionState({
    jpgs: scan.jpgs,
    selectedJpgNames,
    setSelectedJpgNames,
    setSelectedJpgFiles,
  });
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [toolKey, setToolKey] = useState<ToolKey>();
  const [sceneReviewOpen, setSceneReviewOpen] = useState(false);
  const [thumbnailSize, setThumbnailSize] = useState(THUMBNAIL_SIZE_DEFAULT);
  const [jpgSortMode, setJpgSortMode] = useState<BridgeJpgSortMode>("filename");
  const [focusedPlainId, setFocusedPlainId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const folderPanelRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const compactFilterButtonRef = useRef<HTMLButtonElement>(null);
  const previewPanelRef = useRef<HTMLElement>(null);
  const {
    topNotice,
    showTopNotice,
    showAdobeSelectionNotice,
    previewSize,
    setPreviewSize,
    fullscreenPreviewOpen,
    setFullscreenPreviewOpen,
    closeFullscreenPreview,
    previewTab,
    setPreviewTab,
    compactPreviewOpen,
    openCompactPreview,
    closeCompactPreview,
    openOliviaPreview,
    openSelectionPreview,
    floatingWindowRectsRef,
    updateFloatingWindowRect,
  } = useOliviaBridgeUiState({ rootRef });

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
  const resetComparisonFilter = useCallback(() => setComparisonFilter("all"), [setComparisonFilter]);
  const {
    fileFilter,
    setFileFilter,
    labelFilters,
    filenameSearch,
    setFilenameSearch,
    clearFilenameSearch,
    qualityFilter,
    setQualityFilter,
    compactFiltersOpen,
    openCompactFilters,
    closeCompactFilters,
    applyLabelFilterCommand,
    chooseFileFilter,
    handleSearchFilterShortcut,
  } = useOliviaBridgeFilters({
    searchInputRef,
    compactFilterButtonRef,
    folderPanelRef,
    fullscreenPreviewOpen,
    closeFullscreenPreview,
    resetComparisonFilter,
  });
  const { publishRatingsForSource, rememberPublishedRatings } = useOliviaBridgeRatingPublisher({
    jpgs: scan.jpgs,
    selectionSource,
    jpgRatingsByName,
    setJpgRatingsByName,
    setRatings,
    ratingsRef,
    ratingEditsRef,
  });

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
  const { effectiveRatings, effectiveColorLabels } = useOliviaBridgeEffectiveMarks({
    jpgs: scan.jpgs,
    selectionSource,
    ratings,
    adobeRatings,
    ratingEdits,
    colorLabels,
    adobeColorLabels,
    setJpgColorLabelsByName,
  });
  const rawMarkByFileKey = useMemo(() => new Map(scan.raws.flatMap((raw) => {
    const mark = rawAdobeMarks[raw.id];
    return mark ? [[normalizePhotoToolFileKey(raw.name), mark] as const] : [];
  })), [rawAdobeMarks, scan.raws]);
  const {
    selectedNames,
    labeledCount,
    selectedPhotos,
    adobeSelectedCount,
    manualSelectedCount,
    commonSelectedRating,
    commonSelectedColor,
    selectedRatingMixed,
    selectedColorMixed,
    allSelectedExcluded,
    fileFilters,
    selectionFilters,
    activeRatingFilterName,
    activeColorFilterName,
  } = useOliviaBridgeSelectionSummary({
    jpgs: scan.jpgs,
    rawCount: scan.raws.length,
    sidecarCount: scan.sidecars.length,
    selectedIds,
    ratings: effectiveRatings,
    colorLabels: effectiveColorLabels,
    excludedIds,
    selectionSource,
    adobeSelectedIds: adobeSelectedIdsRef.current,
    manualSelectedIds: manualSelectedIdsRef.current,
    labelFilters,
  });
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

  const commitMarqueeSelection = useCallback((selection: Set<string>, focusedPhotoId: string | null) => {
    setSelectedIds(selection);
    setFocusedId(focusedPhotoId);
    setAnchorId(focusedPhotoId);
    setPreviewSize(undefined);
  }, [setPreviewSize, setSelectedIds]);

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
    activateSelectionSource(source);
    if (folderSelectionSourceKey) {
      try {
        localStorage.setItem(`olivia-bridge-selection-source:${folderSelectionSourceKey}`, source);
      } catch {
        // 브라우저 저장소를 사용할 수 없어도 현재 창의 기준 변경은 유지한다.
      }
    }
    publishRatingsForSource(source, adobeRatings);
  }, [activateSelectionSource, adobeRatings, folderSelectionSourceKey, publishRatingsForSource]);

  useOliviaBridgeWorkspaceSync({
    focusedIndex,
    visibleJpgs,
    focusedPhoto,
    visiblePlainFiles,
    focusedPlainFile,
    folderPath,
    selectedJpgCount: selectedNames.length,
    clientId,
    workflowRunId,
    ratings,
    ratingEdits,
    colorLabels,
    excludedIds,
    setFocusedId,
    setAnchorId,
    setFocusedPlainId,
    setPreviewSize,
  });

  const { loadDirectory, loadRemoteDirectory } = useOliviaBridgeFolderLoading({
    includeNestedJpgs,
    rootRef,
    setRemoteLoadProgress,
    setExecutionMode,
    setScanStatus,
    setScanError,
    setToolKey,
    setSceneReviewOpen,
    resetSelectionState,
    setRatings,
    setRatingEdits,
    setColorLabels,
    setExcludedIds,
    setScan,
    setRemoteFolder,
    setBreadcrumbs,
    setRestoreTrail,
    setRestoreMessage,
    resetAdobeMarks,
    setAnchorId,
    setFocusedId,
    setPreviewSize,
    setFileFilter,
    setCurrentLocalFolder,
    setRawMatchFolderPath,
    setRawMatchDefaultFolder,
    setRawMatchFolderCandidates,
    setJpgRatingsByName,
    setJpgColorLabelsByName,
    rememberPublishedRatings,
  });

  const {
    folderSourceOpen,
    nasPickerOpen,
    rawRootPromptOpen,
    rawRootPromptError,
    changeNestedJpgVisibility,
    openFolderSourceChooser,
    closeFolderSourceChooser,
    pickLocalFolder,
    pickNasFolder,
    pickRawSearchRoot,
    openRawRootPrompt,
    closeRawRootPrompt,
    openRawMatchWithCurrentScope,
    cancelNasPicker,
    selectNasFolder,
    closeFolderDialogs,
  } = useOliviaBridgeFolderActions({
    clientId,
    workflowRunId,
    activeFolder,
    activeFolderName,
    breadcrumbs,
    rootRef,
    loadDirectory,
    loadRemoteDirectory,
    setIncludeNestedJpgs,
    setBreadcrumbs,
    setCurrentLocalFolder,
    setRawMatchFolderPath,
    setRawMatchDefaultFolder,
    setRawMatchFolderCandidates,
    setExecutionMode,
    setToolKey,
    showTopNotice,
  });

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
  const {
    openRootFolder,
    openChildFolder,
    openBreadcrumb,
    restoreBrowserFolder,
  } = useOliviaBridgeFolderNavigation({
    breadcrumbs,
    loadDirectory,
    restoreLastFolder,
  });

  const {
    moveFocus,
    moveGridFocus,
    selectAllVisibleJpgs,
    handleFileAreaClick,
    handleFileAreaContextMenu,
    handleFileAreaClickCapture,
    toggleFocusedSelection,
    focusPlainFile,
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

  const {
    fullscreenPhoto,
    fullscreenIndex,
    fullscreenTotal,
    openFullscreenPreview,
    moveFullscreenPreview,
  } = useOliviaBridgePreviewNavigation({
    selectionReviewOpen,
    reviewActivePhoto,
    reviewActiveIndex,
    reviewPhotoCount: reviewPhotos.length,
    focusedPhoto,
    focusedIndex,
    visiblePhotoCount: visibleJpgs.length,
    moveReview,
    moveFocus,
    setFullscreenPreviewOpen,
  });

  const resizeThumbnails = useCallback((direction: -1 | 1) => {
    setThumbnailSize((value) => Math.min(
      THUMBNAIL_SIZE_MAX,
      Math.max(THUMBNAIL_SIZE_MIN, value + (direction * THUMBNAIL_SIZE_STEP)),
    ));
  }, []);

  const closeDialogs = useCallback(() => {
    closeFolderDialogs();
    closePersonSelectImport();
    closeGallerySelectImport();
    rootRef.current?.focus();
  }, [closeFolderDialogs, closeGallerySelectImport, closePersonSelectImport]);
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

  const { openTool, toolDisabledReason } = useOliviaBridgeToolLaunch({
    currentLocalFolder,
    remoteFolder,
    scanStatus,
    selectedIds,
    selectedIdsRef,
    visibleJpgs,
    breadcrumbsLength: breadcrumbs.length,
    setSelectedIds,
    setSelectedJpgFiles,
    setSceneReviewOpen,
    syncAdobeBridgeSelection,
    openRawRootPrompt,
    setToolKey,
  });

  const addCustomerSelectionToAdminSelection = useCallback(() => {
    if (!customerSelectedIds.size) return;
    setSelectedIds((current) => new Set([...current, ...customerSelectedIds]));
    setComparisonFilter("all");
  }, [customerSelectedIds, setComparisonFilter, setSelectedIds]);

  const centerFileCount = visibleJpgs.length + (showRaws ? scan.raws.length : 0) + (showSidecars ? scan.sidecars.length : 0);
  const {
    scenePhotoByName,
    selectedSceneAnalysis,
    selectedScenes,
    sceneBoundaryReviewCount,
    selectedSceneAnalysisReady,
    scenePlanReady,
    applyScenePlan,
  } = useOliviaBridgeSceneReviewModel({
    jpgs: scan.jpgs,
    selectedIds,
    sceneReviewOpen,
    sceneState,
    photoDepartmentResolution,
    departmentLoading,
    adobeSelectionLoading,
    hasActiveFolder,
    activeFolder,
    folderPath,
    stageBridgeClassificationPlan,
    setSceneReviewOpen,
    setToolKey,
    reportScenePlanError,
  });

  const openSceneReview = useCallback(() => {
    setSceneReviewOpen(true);
    void syncAdobeBridgeSelection();
  }, [syncAdobeBridgeSelection]);
  const refreshAdobeMarks = useCallback(() => {
    void syncAdobeBridgeSelection();
  }, [syncAdobeBridgeSelection]);
  return (
    <div ref={rootRef} className={styles.bridge} data-desktop-ui={desktopWindowMode ? "true" : "false"} tabIndex={0} onKeyDown={handleKeyboard} aria-label="Olivia Bridge 사진 작업공간">
      <OliviaBridgeTopBars
        hasActiveFolder={hasActiveFolder}
        sceneStatus={sceneState}
        connectionLabel={remoteFolder ? "NAS 연결" : activeFolder ? "Mac 연결" : "폴더 미연결"}
        onOpenSceneReview={openSceneReview}
        onOpenOlivia={openOliviaPreview}
        folderSourceOpen={folderSourceOpen}
        onOpenFolderSource={openFolderSourceChooser}
        selectionSource={selectionSource}
        onSelectionSourceChange={changeSelectionSource}
        adobeSelectionLoading={adobeSelectionLoading}
        adobeMarkStatus={adobeMarkStatus}
        onRefreshAdobeMarks={refreshAdobeMarks}
        remoteFolderPath={remoteFolder?.displayPath}
        breadcrumbs={breadcrumbs}
        onOpenBreadcrumb={openBreadcrumb}
        includeNestedJpgs={includeNestedJpgs}
        canToggleNestedJpgs={Boolean(activeFolder) && scanStatus !== "loading"}
        onNestedJpgsChange={changeNestedJpgVisibility}
        visibleCount={centerFileCount}
        totalCount={scan.jpgs.length + scan.raws.length + scan.sidecars.length}
        compactFilterButtonRef={compactFilterButtonRef}
        compactFiltersOpen={compactFiltersOpen}
        onOpenCompactFilters={openCompactFilters}
        onOpenSelection={openSelectionPreview}
        topNotice={topNotice}
      />

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

      <OliviaBridgeOverlayLayer
        containerRef={rootRef}
        sceneReview={sceneReviewOpen ? {
          subtitle: adobeSelectionLoading ? "Adobe Bridge 선택 동기화 중" : sceneState.stage,
          rect: floatingWindowRectsRef.current["scene-review"],
          onRectChange: (rect) => updateFloatingWindowRect("scene-review", rect),
          onClose: () => setSceneReviewOpen(false),
          content: {
            sceneState,
            adobeSelectionLoading,
            departmentLoading,
            departmentError,
            departmentPickerOpen,
            departmentResolution: photoDepartmentResolution,
            selectedScenes,
            scenePhotoByName,
            selectedFileCount: selectedSceneAnalysis?.files.length ?? 0,
            boundaryReviewCount: sceneBoundaryReviewCount,
            selectedSceneAnalysisReady,
            scenePlanReady,
            onRetry: retrySceneAnalysis,
            onOpenDepartmentPicker: openDepartmentPicker,
            onChooseDepartment: chooseDepartment,
            onApplyScenePlan: applyScenePlan,
          },
        } : null}
        toolWindow={activeTool ? {
          tool: activeTool,
          activeFolderName,
          selectedCount: selectedNames.length,
          rect: floatingWindowRectsRef.current[`tool-${activeTool.key}`],
          onRectChange: (rect) => updateFloatingWindowRect(`tool-${activeTool.key}`, rect),
          onClose: () => setToolKey(undefined),
          embeddedTool: { clientId, workflowRunId, initialRemoteSelection: remoteProjectSelection },
        } : null}
        selectionReview={selectionReviewOpen ? {
          photos: reviewPhotos,
          activeId: resolvedReviewActiveId,
          rating: reviewActivePhoto ? effectiveRatings[reviewActivePhoto.id] ?? 0 : 0,
          colorLabel: reviewActivePhoto ? effectiveColorLabels[reviewActivePhoto.id] : undefined,
          excluded: Boolean(reviewActivePhoto && excludedIds.has(reviewActivePhoto.id)),
          removedCount: reviewRemoved.length,
          onFocus: focusReviewPhoto,
          onMove: moveReview,
          onRemove: removeReviewPhoto,
          onRestore: restoreReviewPhoto,
          onOpenFullscreen: openFullscreenPreview,
          onClose: closeSelectionReview,
        } : null}
        fullscreenPreview={fullscreenPreviewOpen && fullscreenPhoto ? {
          photo: fullscreenPhoto,
          position: fullscreenIndex + 1,
          total: fullscreenTotal,
          rating: effectiveRatings[fullscreenPhoto.id] ?? 0,
          colorLabel: effectiveColorLabels[fullscreenPhoto.id],
          canMovePrevious: selectionReviewOpen ? fullscreenTotal > 1 : fullscreenIndex > 0,
          canMoveNext: selectionReviewOpen ? fullscreenTotal > 1 : fullscreenIndex >= 0 && fullscreenIndex < fullscreenTotal - 1,
          onMove: moveFullscreenPreview,
          onClose: closeFullscreenPreview,
        } : null}
        folderSourceDialog={folderSourceOpen ? {
          onClose: closeFolderSourceChooser,
          onPickLocal: pickLocalFolder,
          onPickNas: pickNasFolder,
        } : null}
        gallerySelectionDialog={gallerySelectDialogOpen ? {
          result: galleryCustomerResult,
          loading: selectGalleriesLoading,
          error: gallerySelectError,
          galleries: selectGalleries,
          sharedProjects: sharedSelectProjects,
          importingId: gallerySelectImportingId,
          onClose: closeGallerySelectImport,
          onAddToAdmin: addCustomerSelectionToAdminSelection,
          onChooseAnother: chooseAnotherGallerySelection,
          onRetry: () => void loadSelectGalleries(),
          onImportGallery: (gallery) => void importGalleryCustomerSelection(gallery),
          onImportShared: (project) => void importSharedProjectSelection(project),
        } : null}
        personSelectionDialog={personSelectDialogOpen ? {
          result: personSelectResult,
          loading: personSelectEventsLoading,
          error: personSelectError,
          events: personSelectEvents,
          importingId: personSelectImportingId,
          onClose: closePersonSelectImport,
          onChooseAnother: chooseAnotherPersonSelect,
          onRetry: () => void loadPersonSelectEvents(),
          onImport: (event) => void importPersonSelectEvent(event),
        } : null}
        rawRootPromptDialog={rawRootPromptOpen ? {
          error: rawRootPromptError,
          onClose: closeRawRootPrompt,
          onPickRoot: () => void pickRawSearchRoot(),
          onUseCurrent: openRawMatchWithCurrentScope,
        } : null}
        nasPicker={nasPickerOpen ? {
          onCancel: cancelNasPicker,
          onSelectRemote: selectNasFolder,
        } : null}
      />

    </div>
  );
}
