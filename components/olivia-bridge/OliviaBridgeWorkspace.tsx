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
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
import {
  OliviaBridgeBrowserPanel,
  type OliviaBridgeCaptureMetadataState,
} from "@/components/olivia-bridge/OliviaBridgeBrowserPanel";
import {
  OliviaBridgeSceneReviewContent,
} from "@/components/olivia-bridge/OliviaBridgeSceneReviewContent";
import { useOliviaBridgeSceneAnalysis } from "@/components/olivia-bridge/useOliviaBridgeSceneAnalysis";
import {
  BridgeFolderSourceDialog,
  BridgeGallerySelectionDialog,
  BridgePersonSelectionDialog,
  BridgeRawRootPromptDialog,
  type GalleryCustomerSelectionResult,
  type PersonSelectEventSummary,
  type PersonSelectImportResult,
  type SelectGallerySummary,
} from "@/components/olivia-bridge/OliviaBridgeDialogs";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import {
  bridgeFileKind,
  readBridgeCaptureMetadata,
  rebuildBridgeSceneAnalysis,
  resolveBridgeToolSelection,
  scanBridgeFolder,
  sortBridgeJpgs,
  updateBridgeSelection,
  type BridgeFolderScan,
  type BridgeJpgFile,
  type BridgeJpgSortMode,
} from "@/lib/photo-bridge/bridgeFiles";
import { createBridgeClassificationPlan } from "@/lib/photo-bridge/classificationPlan";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";
import { collectAdobeBridgeMarks, type AdobeBridgeMark } from "@/lib/selectMatch/bridgeRating";
import type { BridgeFloatingWindowRect } from "@/lib/photo-bridge/floatingWindow";
import { REMOTE_NAS_ROOT_NAME, type RemoteNasSelection } from "@/lib/remote-nas/types";
import { normalizeRemoteNasRelativePath, toRemoteNasDisplayPath } from "@/lib/remote-nas/path";
import { loadRemoteBridgeRatings } from "@/lib/photo-bridge/remoteRatings";
import { loadRemoteBridgeThumbnails } from "@/lib/photo-bridge/remoteThumbnails";
import { projectAdobeBridgeMarks } from "@/lib/photo-bridge/adobeMarkProjection";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import {
  bridgeGridNavigationTarget,
  type BridgeGridDirection,
} from "@/lib/photo-bridge/gridNavigation";
import {
  bridgeKeyboardRangeSelection,
  cycleBridgeReviewIndex,
  removeBridgeReviewItem,
  restoreBridgeReviewItem,
  type BridgeReviewRemovedItem,
} from "@/lib/photo-bridge/reviewMode";
import {
  DEFAULT_BRIDGE_SELECTION_SOURCE,
  normalizeBridgeSelectionSource,
  normalizePhotoToolFileKey,
  resolveBridgeSelection,
  type BridgeSelectionSource,
} from "@/lib/photo-bridge/toolLinkage";
import { matchPersonSelectFileNames } from "@/lib/photo-bridge/personSelectImport";
import {
  customerSelectionComparisonCounts,
  matchCustomerSelectionToBridgeFiles,
  matchesCustomerSelectionComparison,
  type CustomerSelectionComparisonFilter,
  type CustomerSelectionMatchItem,
} from "@/lib/select-gallery/customerBridge";
import {
  bridgeMarqueeSelection,
  bridgeMarqueeUsesAdditiveSelection,
  bridgeRectangleFromPoints,
  bridgeRectanglesIntersect,
  type BridgePoint,
  type BridgeRectangle,
} from "@/lib/photo-bridge/marqueeSelection";
import {
  bridgeRawMatchDefaultFolder,
  bridgeRawMatchFolderCandidates,
  clearBridgeFolderTrail,
  queryBridgeFolderTrailPermission,
  readBridgeFolderTrail,
  requestBridgeFolderTrailPermission,
  resolveBridgeFolderTrail,
  saveBridgeFolderTrail,
} from "@/lib/photo-bridge/recentFolder";
import {
  BRIDGE_COLOR_LABELS,
  EMPTY_BRIDGE_LABEL_FILTERS,
  bridgeFilenameSearchTokens,
  bridgeLabelFilterName,
  hasActiveBridgeLabelFilters,
  matchesBridgeFilenameSearch,
  matchesBridgeLabelFilters,
  matchesBridgeSelectionView,
  normalizeBridgeColorLabels,
  normalizeBridgeRatingEdits,
  resolveBridgeRatings,
  toggleBridgeColorLabel,
  updateBridgeLabelFilters,
  updateBridgeRatingEdits,
  type BridgeColorLabel,
  type BridgeColorLabels,
  type BridgeLabelFilterCommand,
  type BridgeLabelFilters,
  type BridgeRatingEdits,
} from "@/lib/photo-bridge/labels";
import { useBridgeSearchFilterShortcuts } from "@/lib/photo-bridge/useBridgeSearchFilterShortcuts";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { useDesktopWindowMode, useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";
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

type Breadcrumb = { name: string; handle: FileSystemDirectoryHandle };
type ReviewRemovedSource = BridgeReviewRemovedItem & { wasManual: boolean; wasAdobe: boolean };
type MarqueeCard = { id: string; element: HTMLElement; rectangle: BridgeRectangle };
type MarqueeSession = {
  pointerId: number;
  start: BridgePoint;
  current: BridgePoint;
  additive: boolean;
  initialSelection: Set<string>;
  currentSelection: Set<string>;
  started: boolean;
  cards: MarqueeCard[];
};

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

async function countBridgeFolderImages(directory: FileSystemDirectoryHandle, depth = 0): Promise<number> {
  if (depth > 5) return 0;
  let count = 0;
  const iterable = directory as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  try {
    for await (const [name, handle] of iterable.entries()) {
      if (name.startsWith(".")) continue;
      if (handle.kind === "directory") {
        if (isDeliveredRoundFolder(name)) continue;
        count += await countBridgeFolderImages(handle as FileSystemDirectoryHandle, depth + 1);
        continue;
      }
      const kind = bridgeFileKind(name);
      if (kind === "jpg" || kind === "raw") count += 1;
    }
  } catch {
    return count;
  }
  return count;
}

function isMacControlClick(event: { ctrlKey: boolean; metaKey: boolean }) {
  if (!event.ctrlKey || event.metaKey) return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

function isSpaceShortcutTarget(target: EventTarget | null, root: HTMLDivElement) {
  return target === root || (target instanceof HTMLElement && Boolean(target.closest("[data-bridge-photo-id]")));
}

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
  const [, setScanError] = useState<string>();
  const [includeNestedJpgs, setIncludeNestedJpgs] = useState(false);
  const [restoreTrail, setRestoreTrail] = useState<Breadcrumb[]>([]);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [selectedIds, setSelectedIdsState] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const manualSelectedIdsRef = useRef<Set<string>>(new Set());
  const adobeSelectedIdsRef = useRef<Set<string>>(new Set());
  const manualRemovedIdsRef = useRef<Set<string>>(new Set());
  const adobeSelectionGenerationRef = useRef(0);
  const [selectionSource, setSelectionSource] = useState<BridgeSelectionSource>(DEFAULT_BRIDGE_SELECTION_SOURCE);
  const selectionSourceRef = useRef<BridgeSelectionSource>(DEFAULT_BRIDGE_SELECTION_SOURCE);
  const [topNotice, setTopNotice] = useState("");
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [toolKey, setToolKey] = useState<ToolKey>();
  const [sceneReviewOpen, setSceneReviewOpen] = useState(false);
  const [selectionReviewOpen, setSelectionReviewOpen] = useState(false);
  const [reviewActiveId, setReviewActiveId] = useState<string | null>(null);
  const [reviewRemoved, setReviewRemoved] = useState<ReviewRemovedSource[]>([]);
  const [thumbnailSize, setThumbnailSize] = useState(THUMBNAIL_SIZE_DEFAULT);
  const [jpgSortMode, setJpgSortMode] = useState<BridgeJpgSortMode>("filename");
  const [captureMetadataState, setCaptureMetadataState] = useState<OliviaBridgeCaptureMetadataState>({ status: "idle", completed: 0, total: 0, fallbackCount: 0 });
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [labelFilters, setLabelFilters] = useState<BridgeLabelFilters>(() => ({ ...EMPTY_BRIDGE_LABEL_FILTERS }));
  const [filenameSearch, setFilenameSearch] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [adobeRatings, setAdobeRatings] = useState<Record<string, number>>({});
  const [adobeColorLabels, setAdobeColorLabels] = useState<BridgeColorLabels>({});
  const [rawAdobeMarks, setRawAdobeMarks] = useState<Record<string, AdobeBridgeMark>>({});
  const [ratingEdits, setRatingEdits] = useState<BridgeRatingEdits>({});
  const [adobeSelectionLoading, setAdobeSelectionLoading] = useState(false);
  const [adobeMarkStatus, setAdobeMarkStatus] = useState({
    read: 0,
    total: 0,
    rated: 0,
    colored: 0,
    failed: 0,
    failedFileNames: [] as string[],
    firstError: null as string | null,
  });
  const [colorLabels, setColorLabels] = useState<BridgeColorLabels>({});
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>();
  const [fullscreenPreviewOpen, setFullscreenPreviewOpen] = useState(false);
  const [folderSourceOpen, setFolderSourceOpen] = useState(false);
  const [nasPickerOpen, setNasPickerOpen] = useState(false);
  const [personSelectDialogOpen, setPersonSelectDialogOpen] = useState(false);
  const [personSelectEvents, setPersonSelectEvents] = useState<PersonSelectEventSummary[]>([]);
  const [personSelectEventsLoading, setPersonSelectEventsLoading] = useState(false);
  const [personSelectImportingId, setPersonSelectImportingId] = useState("");
  const [personSelectError, setPersonSelectError] = useState("");
  const [personSelectResult, setPersonSelectResult] = useState<PersonSelectImportResult | null>(null);
  const [gallerySelectDialogOpen, setGallerySelectDialogOpen] = useState(false);
  const [selectGalleries, setSelectGalleries] = useState<SelectGallerySummary[]>([]);
  const [sharedSelectProjects, setSharedSelectProjects] = useState<PersonSelectEventSummary[]>([]);
  const [selectGalleriesLoading, setSelectGalleriesLoading] = useState(false);
  const [gallerySelectImportingId, setGallerySelectImportingId] = useState("");
  const [gallerySelectError, setGallerySelectError] = useState("");
  const [galleryCustomerResult, setGalleryCustomerResult] = useState<GalleryCustomerSelectionResult | null>(null);
  const [customerSelectedIds, setCustomerSelectedIds] = useState<Set<string>>(new Set());
  const [customerRatings, setCustomerRatings] = useState<Record<string, number>>({});
  const [customerNotes, setCustomerNotes] = useState<Record<string, string>>({});
  const [comparisonFilter, setComparisonFilter] = useState<CustomerSelectionComparisonFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [qualityByBridgeId, setQualityByBridgeId] = useState<Record<string, PublicPhotoQualityResult>>({});
  const [qualityJob, setQualityJob] = useState<Record<string, unknown> | null>(null);
  const [qualityMessage, setQualityMessage] = useState("");
  const [rawRootPromptOpen, setRawRootPromptOpen] = useState(false);
  const [rawRootPromptError, setRawRootPromptError] = useState("");
  const [folderImageCounts, setFolderImageCounts] = useState<Record<string, number>>({});
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
  const fileAreaRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeSessionRef = useRef<MarqueeSession | null>(null);
  const marqueeFrameRef = useRef<number | null>(null);
  const suppressThumbnailClickRef = useRef(false);
  const restoreAttemptedRef = useRef(false);
  const remoteLoadGenerationRef = useRef(0);
  const captureMetadataGenerationRef = useRef(0);
  const ratingsRef = useRef(ratings);
  const adobeRatingsRef = useRef(adobeRatings);
  const adobeColorLabelsRef = useRef(adobeColorLabels);
  const ratingEditsRef = useRef(ratingEdits);
  const lastPublishedRatingsRef = useRef<Record<string, number> | null>(null);
  const topNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawMatchOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeFolder = breadcrumbs.at(-1)?.handle ?? null;
  const folderPath = remoteFolder?.path ?? breadcrumbs.map((item) => item.name).join(" / ");
  const folderSelectionSourceKey = remoteFolder?.path ?? breadcrumbs.map((item) => item.name).join("/");
  const activeFolderName = activeFolder?.name ?? remoteFolder?.displayPath.split("/").filter(Boolean).at(-1) ?? "";
  const hasActiveFolder = Boolean(activeFolder || remoteFolder);
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
  const filenameSearchTokens = useMemo(() => bridgeFilenameSearchTokens(filenameSearch), [filenameSearch]);
  const hasLabelFilters = hasActiveBridgeLabelFilters(labelFilters);
  const visibleJpgs = useMemo(() => sortBridgeJpgs(scan.jpgs.filter((photo) => {
    const passesFileFilter = hasLabelFilters
      ? matchesBridgeLabelFilters(photo.id, labelFilters, effectiveRatings, effectiveColorLabels)
      : fileFilter === "raw" || fileFilter === "sidecar"
        ? false
        : fileFilter === "starred" || fileFilter === "colored" || fileFilter === "selected" || fileFilter === "unselected"
          ? matchesBridgeSelectionView(photo.id, fileFilter, effectiveRatings, effectiveColorLabels)
          : fileFilter === "excluded"
            ? excludedIds.has(photo.id)
            : true;
    if (!passesFileFilter) return false;
    if (!matchesBridgeFilenameSearch(photo.name, filenameSearchTokens)) return false;
    const quality = qualityByBridgeId[photo.id];
    if (qualityFilter === "eyes_closed" || qualityFilter === "face_too_dark" || qualityFilter === "motion_blur") {
      if (!quality?.flags.includes(qualityFilter)) return false;
    } else if (qualityFilter === "needs_review" && quality?.status !== "needs_review") return false;
    else if (qualityFilter === "normal" && quality?.status !== "normal" && quality?.reviewStatus !== "confirmed_normal") return false;
    return matchesCustomerSelectionComparison({ id: photo.id, filter: comparisonFilter, adminIds: selectedIds, customerIds: customerSelectedIds });
  }), jpgSortMode), [comparisonFilter, customerSelectedIds, effectiveColorLabels, effectiveRatings, excludedIds, fileFilter, filenameSearchTokens, hasLabelFilters, jpgSortMode, labelFilters, qualityByBridgeId, qualityFilter, scan.jpgs, selectedIds]);
  const visiblePhotoById = useMemo(
    () => new Map(visibleJpgs.map((photo) => [photo.id, photo] as const)),
    [visibleJpgs],
  );
  const comparisonCounts = useMemo(
    () => customerSelectionComparisonCounts(scan.jpgs.map((photo) => photo.id), selectedIds, customerSelectedIds),
    [customerSelectedIds, scan.jpgs, selectedIds],
  );
  const qualityCounts = useMemo(() => scan.jpgs.reduce((counts, photo) => {
    const quality = qualityByBridgeId[photo.id];
    if (!quality) return counts;
    for (const flag of quality.flags) counts[flag] += 1;
    if (quality.status === "needs_review") counts.needs_review += 1;
    if (quality.status === "normal" || quality.reviewStatus === "confirmed_normal") counts.normal += 1;
    return counts;
  }, { eyes_closed: 0, face_too_dark: 0, motion_blur: 0, needs_review: 0, normal: 0 }), [qualityByBridgeId, scan.jpgs]);
  const reviewPhotos = useMemo(() => sortBridgeJpgs(scan.jpgs.filter((photo) => selectedIds.has(photo.id)), jpgSortMode), [jpgSortMode, scan.jpgs, selectedIds]);
  const resolvedReviewActiveId = reviewActiveId && reviewPhotos.some((photo) => photo.id === reviewActiveId)
    ? reviewActiveId
    : reviewPhotos[0]?.id ?? null;
  const reviewActiveIndex = reviewPhotos.findIndex((photo) => photo.id === resolvedReviewActiveId);
  const reviewActivePhoto = reviewPhotos[reviewActiveIndex] ?? null;
  const showRaws = comparisonFilter === "all" && !hasLabelFilters && !filenameSearchTokens.length && (fileFilter === "all" || fileFilter === "raw");
  const showSidecars = comparisonFilter === "all" && !hasLabelFilters && !filenameSearchTokens.length && (fileFilter === "all" || fileFilter === "sidecar");
  const focusedIndex = useMemo(() => visibleJpgs.findIndex((photo) => photo.id === focusedId), [focusedId, visibleJpgs]);
  const focusedPhoto = visibleJpgs.find((photo) => photo.id === focusedId) ?? null;
  const visiblePlainFiles = useMemo(() => [
    ...(showRaws ? scan.raws : []),
    ...(showSidecars ? scan.sidecars : []),
  ], [scan.raws, scan.sidecars, showRaws, showSidecars]);
  const focusedPlainFile = visiblePlainFiles.find((file) => file.id === focusedPlainId) ?? null;
  const activeTool = BRIDGE_TOOL_ITEMS.find((item) => item.key === toolKey);

  const showTopNotice = useCallback((message: string, duration = 3_000) => {
    if (topNoticeTimerRef.current) clearTimeout(topNoticeTimerRef.current);
    setTopNotice(message);
    topNoticeTimerRef.current = setTimeout(() => {
      setTopNotice("");
      topNoticeTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    const generation = ++captureMetadataGenerationRef.current;
    if (jpgSortMode !== "capture" || scanStatus !== "ready" || !scan.jpgs.length) {
      setCaptureMetadataState({ status: "idle", completed: 0, total: scan.jpgs.length, fallbackCount: 0 });
      return;
    }
    const ready = scan.jpgs.every((photo) => photo.captureTimestamp !== undefined && photo.timestampSource);
    if (ready) {
      setCaptureMetadataState({
        status: "ready",
        completed: scan.jpgs.length,
        total: scan.jpgs.length,
        fallbackCount: scan.jpgs.filter((photo) => photo.timestampSource === "mtime").length,
      });
      return;
    }

    const controller = new AbortController();
    setCaptureMetadataState({ status: "loading", completed: 0, total: scan.jpgs.length, fallbackCount: 0 });
    void readBridgeCaptureMetadata(scan.jpgs, {
      signal: controller.signal,
      onProgress: (completed, total) => {
        if (generation !== captureMetadataGenerationRef.current) return;
        setCaptureMetadataState((current) => ({ ...current, status: "loading", completed, total }));
      },
    }).then((jpgs) => {
      if (generation !== captureMetadataGenerationRef.current) return;
      setScan((current) => {
        if (current.jpgs.length !== scan.jpgs.length || current.jpgs.some((photo, index) => photo.id !== scan.jpgs[index]?.id)) return current;
        return { ...current, jpgs };
      });
      setCaptureMetadataState({
        status: "ready",
        completed: jpgs.length,
        total: jpgs.length,
        fallbackCount: jpgs.filter((photo) => photo.timestampSource === "mtime").length,
      });
    }).catch((error) => {
      if (controller.signal.aborted || generation !== captureMetadataGenerationRef.current) return;
      console.error("[olivia-bridge] Failed to read capture metadata", error);
      setCaptureMetadataState({ status: "error", completed: 0, total: scan.jpgs.length, fallbackCount: 0 });
    });
    return () => controller.abort();
  }, [jpgSortMode, scan.jpgs, scanStatus]);

  const showAdobeSelectionNotice = useCallback(() => {
    showTopNotice("어도비 기준입니다. 별점은 어도비 브릿지에서 바꿔 주세요.");
  }, [showTopNotice]);

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
    setSelectedJpgNames(scan.jpgs.filter((photo) => next.has(photo.id)).map((photo) => photo.name));
  }, [scan.jpgs, setSelectedJpgNames]);

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

  const publishRatingsForSource = useCallback((
    source = selectionSourceRef.current,
    nextAdobe = adobeRatingsRef.current,
  ) => {
    const resolved = resolveBridgeRatings(source, ratingsRef.current, nextAdobe, ratingEditsRef.current);
    const byId = Object.fromEntries(scan.jpgs.flatMap((photo) => resolved[photo.id] ? [[photo.id, resolved[photo.id]] as const] : []));
    lastPublishedRatingsRef.current = byId;
    setJpgRatingsByName(
      Object.fromEntries(scan.jpgs.map((photo) => [photo.name, resolved[photo.id] ?? 0])),
      { overwrite: true },
    );
  }, [scan.jpgs, setJpgRatingsByName]);

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
    publishRatingsForSource(source);
  }, [commitSelectedIds, folderSelectionSourceKey, publishRatingsForSource]);

  const updateFloatingWindowRect = useCallback((windowId: string, rect: BridgeFloatingWindowRect) => {
    floatingWindowRectsRef.current[windowId] = rect;
  }, []);

  useEffect(() => {
    setSelectedJpgFiles(scan.jpgs
      .filter((photo) => selectedIds.has(photo.id))
      .map((photo) => photo.file)
      .filter((file): file is File => Boolean(file)));
  }, [scan.jpgs, selectedIds, setSelectedJpgFiles]);

  useEffect(() => {
    setJpgColorLabelsByName(
      Object.fromEntries(scan.jpgs.map((photo) => [photo.name, effectiveColorLabels[photo.id] ?? 0])),
      { overwrite: true },
    );
  }, [effectiveColorLabels, scan.jpgs, setJpgColorLabelsByName]);

  useEffect(() => {
    const selectedKeys = new Set(selectedJpgNames.map(normalizePhotoToolFileKey).filter(Boolean));
    const next = new Set(scan.jpgs.filter((photo) => selectedKeys.has(normalizePhotoToolFileKey(photo.name))).map((photo) => photo.id));
    if (selectedIdsRef.current.size === next.size && [...selectedIdsRef.current].every((id) => next.has(id))) return;
    setSelectedIds(next);
  }, [scan.jpgs, selectedJpgNames, setSelectedIds]);

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const photo of scan.jpgs) {
      const rating = jpgRatingsByName[normalizePhotoToolFileKey(photo.name)];
      if (rating) next[photo.id] = rating;
    }
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

  useEffect(() => { ratingsRef.current = ratings; }, [ratings]);
  useEffect(() => { adobeRatingsRef.current = adobeRatings; }, [adobeRatings]);
  useEffect(() => { adobeColorLabelsRef.current = adobeColorLabels; }, [adobeColorLabels]);
  useEffect(() => { ratingEditsRef.current = ratingEdits; }, [ratingEdits]);

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
    setExecutionMode("LOCAL_DIRECT");
    setScanStatus("loading");
    setScanError(undefined);
    setToolKey(undefined);
    setSceneReviewOpen(false);
    try {
      const nextPath = trail.map((item) => item.name).join(" / ");
      const selectionSourceKey = trail.map((item) => item.name).join("/");
      let nextSelectionSource = DEFAULT_BRIDGE_SELECTION_SOURCE;
      try {
        nextSelectionSource = normalizeBridgeSelectionSource(localStorage.getItem(`olivia-bridge-selection-source:${selectionSourceKey}`));
      } catch {
        nextSelectionSource = DEFAULT_BRIDGE_SELECTION_SOURCE;
      }
      selectionSourceRef.current = nextSelectionSource;
      setSelectionSource(nextSelectionSource);
      const next = await scanBridgeFolder(directory, nextPath, {
        includeNestedJpgs: nestedJpgs,
        maxDepth: 5,
      });
      let restoredRatings: Record<string, number> = {};
      let restoredColorLabels: BridgeColorLabels = {};
      try {
        const parsed = JSON.parse(localStorage.getItem(`olivia-bridge:marks:${nextPath}`) ?? "{}") as { ratings?: Record<string, number>; ratingEdits?: unknown; colorLabels?: unknown; excluded?: string[] };
        restoredRatings = parsed.ratings ?? {};
        setRatings(restoredRatings);
        setRatingEdits(normalizeBridgeRatingEdits(parsed.ratingEdits));
        restoredColorLabels = normalizeBridgeColorLabels(parsed.colorLabels);
        setColorLabels(restoredColorLabels);
        setExcludedIds(new Set(parsed.excluded ?? []));
      } catch {
        setRatings({});
        setRatingEdits({});
        setColorLabels({});
        setExcludedIds(new Set());
      }
      setScan(next);
      setRemoteFolder(null);
      setBreadcrumbs(trail);
      setRestoreTrail([]);
      setRestoreMessage("");
      manualSelectedIdsRef.current = new Set();
      adobeSelectedIdsRef.current = new Set();
      manualRemovedIdsRef.current = new Set();
      setAdobeRatings({});
      setAdobeColorLabels({});
      setRawAdobeMarks({});
      adobeRatingsRef.current = {};
      adobeColorLabelsRef.current = {};
      commitSelectedIds(new Set(), new Set(), nextSelectionSource);
      setAnchorId(null);
      setFocusedId(next.jpgs[0]?.id ?? null);
      setPreviewSize(undefined);
      setFileFilter("all");
      setCurrentLocalFolder(directory);
      setRawMatchFolderPath(nextPath);
      setRawMatchDefaultFolder(bridgeRawMatchDefaultFolder(trail));
      setRawMatchFolderCandidates(bridgeRawMatchFolderCandidates(trail));
      const restoredRatingsByName = Object.fromEntries(next.jpgs.flatMap((photo) => {
        const rating = restoredRatings[photo.id];
        return rating ? [[photo.name, rating] as const] : [];
      }));
      setJpgRatingsByName(restoredRatingsByName, { overwrite: true });
      setJpgColorLabelsByName(
        Object.fromEntries(next.jpgs.map((photo) => [photo.name, restoredColorLabels[photo.id] ?? 0])),
        { overwrite: true },
      );
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
  }, [commitSelectedIds, includeNestedJpgs, setCurrentLocalFolder, setExecutionMode, setJpgColorLabelsByName, setJpgRatingsByName, setRawMatchDefaultFolder, setRawMatchFolderCandidates, setRawMatchFolderPath]);

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
    setScanStatus("loading");
    setScanError(undefined);
    setToolKey(undefined);
    setSceneReviewOpen(false);
    setRemoteFolder(selection);
    let nextSelectionSource = DEFAULT_BRIDGE_SELECTION_SOURCE;
    try {
      nextSelectionSource = normalizeBridgeSelectionSource(localStorage.getItem(`olivia-bridge-selection-source:${selection.path}`));
    } catch {
      nextSelectionSource = DEFAULT_BRIDGE_SELECTION_SOURCE;
    }
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
    setAdobeRatings({});
    setAdobeColorLabels({});
    setRawAdobeMarks({});
    adobeRatingsRef.current = {};
    adobeColorLabelsRef.current = {};
    setRatingEdits({});
    setColorLabels({});
    setExcludedIds(new Set());
    try {
      const result = await loadRemoteBridgeThumbnails(selection.path);
      if (generation !== remoteLoadGenerationRef.current) return;
      const jpgs: BridgeJpgFile[] = result.thumbs.map((thumb) => ({
        id: `${selection.path}:${thumb.relativePath}:${thumb.size}:${thumb.lastModified}`,
        name: thumb.name.normalize("NFC"),
        relativeDirectory: thumb.relativePath.includes("/") ? thumb.relativePath.split("/").slice(0, -1).join("/").normalize("NFC") : "",
        relativePath: thumb.relativePath.normalize("NFC"),
        extension: thumb.name.split(".").pop()?.toLocaleUpperCase("en-US") ?? "JPG",
        thumbnailUrl: thumb.dataUrl,
        size: thumb.size,
        lastModified: thumb.lastModified,
        captureTimestamp: thumb.captureTimestamp,
        timestampSource: thumb.timestampSource,
      }));
      setScan({ ...EMPTY_SCAN, jpgs });
      lastPublishedRatingsRef.current = {};
      setJpgRatingsByName(Object.fromEntries(jpgs.map((photo) => [photo.name, 0])), { overwrite: true });
      setJpgColorLabelsByName(Object.fromEntries(jpgs.map((photo) => [photo.name, 0])), { overwrite: true });
      setFocusedId(jpgs[0]?.id ?? null);
      setScanStatus("ready");
      rootRef.current?.focus();
    } catch (error) {
      if (generation !== remoteLoadGenerationRef.current) return;
      console.error("[olivia-bridge] Failed to read remote folder", error);
      setScanStatus("error");
      setScanError(error instanceof Error ? error.message : "원격 썸네일을 읽지 못했습니다.");
    }
  }, [commitSelectedIds, setCurrentLocalFolder, setJpgColorLabelsByName, setJpgRatingsByName, setRawMatchFolderPath]);

  const remoteFolderQuery = useMemo(() => {
    if (!routeHref) return sp.get("remoteFolder");
    try {
      return new URL(routeHref, "https://olivia.local").searchParams.get("remoteFolder");
    } catch {
      return null;
    }
  }, [routeHref, sp]);
  const remoteFolderPrefillApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!remoteFolderQuery || remoteFolderPrefillApplied.current === remoteFolderQuery) return;
    remoteFolderPrefillApplied.current = remoteFolderQuery;
    try {
      const path = normalizeRemoteNasRelativePath(remoteFolderQuery);
      if (!path) return;
      restoreAttemptedRef.current = true;
      setExecutionMode("REMOTE_WORKER");
      void loadRemoteDirectory({
        path,
        displayPath: toRemoteNasDisplayPath(path),
        rootName: REMOTE_NAS_ROOT_NAME,
      });
    } catch {
      // 잘못된 경로면 조용히 넘기고 사용자가 직접 폴더를 고르게 둔다.
    }
  }, [loadRemoteDirectory, remoteFolderQuery, setExecutionMode]);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    let disposed = false;

    void readBridgeFolderTrail().then(async (trail) => {
      if (disposed) return;
      if (!trail?.length) {
        setScanStatus("idle");
        return;
      }
      const permission = await queryBridgeFolderTrailPermission(trail);
      if (disposed) return;
      if (permission === "granted") {
        await loadDirectory(trail.at(-1)!.handle, trail);
        return;
      }
      if (permission === "prompt" || permission === "denied") {
        setRestoreTrail(trail);
        setRestoreMessage(permission === "denied"
          ? `${trail.at(-1)?.name ?? "지난 폴더"} 접근 권한이 해제되었습니다. 다시 허용하면 이어서 열 수 있습니다.`
          : `${trail.at(-1)?.name ?? "지난 폴더"} 접근 권한을 다시 확인해 주세요.`);
        setScanStatus("idle");
        return;
      }
    }).catch(async (error) => {
      console.error("[olivia-bridge] Failed to restore the last folder", error);
      await clearBridgeFolderTrail().catch(() => undefined);
      if (disposed) return;
      setRestoreMessage("지난 폴더를 다시 열지 못했습니다. 새 폴더를 선택해 주세요.");
      setScanStatus("idle");
    });

    return () => { disposed = true; };
  }, [loadDirectory]);

  const restoreLastFolder = useCallback(async () => {
    if (!restoreTrail.length) return;
    setRestoreMessage("");
    try {
      const permission = await requestBridgeFolderTrailPermission(restoreTrail);
      if (permission !== "granted") {
        setRestoreMessage("지난 폴더의 접근 권한을 허용하지 않았습니다. 다른 폴더를 선택할 수 있습니다.");
        return;
      }
      await loadDirectory(restoreTrail.at(-1)!.handle, restoreTrail);
    } catch (error) {
      console.error("[olivia-bridge] Failed to request the last folder permission", error);
      setRestoreMessage("지난 폴더를 다시 열지 못했습니다. 다른 폴더를 선택해 주세요.");
    }
  }, [loadDirectory, restoreTrail]);

  const syncAdobeBridgeSelection = useCallback(async (signal?: AbortSignal) => {
    const generation = ++adobeSelectionGenerationRef.current;
    if (selectionSourceRef.current === "olivia") {
      setAdobeSelectionLoading(false);
      return;
    }
    if ((!scan.jpgs.length && !scan.raws.length) || (!activeFolder && !remoteFolder)) {
      setAdobeRatings({});
      setAdobeColorLabels({});
      setRawAdobeMarks({});
      adobeRatingsRef.current = {};
      adobeColorLabelsRef.current = {};
      commitSelectedIds(manualSelectedIdsRef.current, new Set());
      setAdobeSelectionLoading(false);
      setAdobeMarkStatus({ read: 0, total: 0, rated: 0, colored: 0, failed: 0, failedFileNames: [], firstError: null });
      return;
    }

    // 원격(NAS)은 브라우저가 파일을 못 여니 맥스튜디오 워커가 XMP 별점을 읽어서 넘긴다.
    if (!activeFolder && remoteFolder) {
      setAdobeSelectionLoading(true);
      try {
        const remote = await loadRemoteBridgeRatings(remoteFolder.path, { signal });
        if (signal?.aborted || generation !== adobeSelectionGenerationRef.current) return;
        const byKey = new Map(remote.ratings.map((item) => [item.key, item]));
        const rated = remote.ratings.filter((mark) => mark.rating !== null).length;
        const colored = remote.ratings.filter((mark) => mark.colorLabel !== null).length;
        const projected = projectAdobeBridgeMarks(scan.jpgs, scan.raws, byKey);
        setAdobeRatings(projected.ratings);
        setAdobeColorLabels(projected.colorLabels);
        setRawAdobeMarks(projected.rawMarks);
        setAdobeMarkStatus({ read: remote.scanned, total: remote.scanned, rated, colored, failed: 0, failedFileNames: [], firstError: null });
        adobeRatingsRef.current = projected.ratings;
        adobeColorLabelsRef.current = projected.colorLabels;
        publishRatingsForSource(selectionSourceRef.current, projected.ratings);
        commitSelectedIds(manualSelectedIdsRef.current, projected.selectedIds);
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        console.error("[olivia-bridge] Failed to sync remote Adobe Bridge ratings", error);
        setAdobeMarkStatus((current) => ({ ...current, failed: Math.max(1, current.failed), firstError: error instanceof Error ? error.message : String(error) }));
      } finally {
        if (generation === adobeSelectionGenerationRef.current) setAdobeSelectionLoading(false);
      }
      return;
    }

    setAdobeSelectionLoading(true);
    try {
      const localPhotos = [...scan.jpgs, ...scan.raws]
        .filter((photo) => Boolean(photo.handle || ("file" in photo && photo.file)))
        .map((photo) => ({
          name: photo.name,
          file: ("file" in photo ? photo.file : undefined) as File | undefined,
          handle: photo.handle,
          parentHandle: photo.parentHandle,
          relativeDirectory: photo.relativeDirectory,
        }));
      setAdobeMarkStatus({ read: 0, total: localPhotos.length, rated: 0, colored: 0, failed: 0, failedFileNames: [], firstError: null });
      const found = await collectAdobeBridgeMarks(activeFolder!, localPhotos, {
        signal,
        onProgress: (progress) => {
          if (generation !== adobeSelectionGenerationRef.current) return;
          setAdobeMarkStatus((current) => ({ ...current, ...progress }));
        },
      });
      if (signal?.aborted || generation !== adobeSelectionGenerationRef.current) return;
      // 파일명 기준 공용 저장소에도 넣는다. 손으로 준 별점은 applyRating이 넣고 있는데
      // 어도비에서 읽어온 별점만 빠져 있어서, RAW 매칭·사진 셀렉이 그 별점을 못 받았다.
      const projected = projectAdobeBridgeMarks(scan.jpgs, scan.raws, found.marks);
      setAdobeRatings(projected.ratings);
      setAdobeColorLabels(projected.colorLabels);
      setRawAdobeMarks(projected.rawMarks);
      setAdobeMarkStatus({
        read: found.read,
        total: found.total,
        rated: found.rated,
        colored: found.colored,
        failed: found.failed,
        failedFileNames: found.failedFileNames,
        firstError: found.firstError,
      });
      adobeRatingsRef.current = projected.ratings;
      adobeColorLabelsRef.current = projected.colorLabels;
      publishRatingsForSource(selectionSourceRef.current, projected.ratings);
      commitSelectedIds(manualSelectedIdsRef.current, projected.selectedIds);
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      console.error("[olivia-bridge] Failed to sync Adobe Bridge ratings", error);
      setAdobeMarkStatus((current) => ({ ...current, failed: Math.max(1, current.failed), firstError: error instanceof Error ? error.message : String(error) }));
    } finally {
      if (generation === adobeSelectionGenerationRef.current) setAdobeSelectionLoading(false);
    }
  }, [activeFolder, commitSelectedIds, publishRatingsForSource, remoteFolder, scan.jpgs, scan.raws]);

  useEffect(() => {
    if (scanStatus !== "ready" || selectionSource === "olivia") return;
    const controller = new AbortController();
    void syncAdobeBridgeSelection(controller.signal);
    return () => controller.abort();
  }, [scanStatus, selectionSource, syncAdobeBridgeSelection]);

  useEffect(() => {
    if (scanStatus !== "ready" || selectionSource === "olivia") return;
    const refresh = () => { void syncAdobeBridgeSelection(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [scanStatus, selectionSource, syncAdobeBridgeSelection]);

  useEffect(() => {
    const openInspector = () => {
      setPreviewTab("selection");
      setCompactPreviewOpen(true);
    };
    window.addEventListener("olivia-bridge-open-inspector", openInspector);
    return () => window.removeEventListener("olivia-bridge-open-inspector", openInspector);
  }, []);

  const choosePhoto = useCallback((photo: BridgeJpgFile, event: ReactMouseEvent) => {
    const next = updateBridgeSelection({ current: selectedIds, orderedIds: visibleJpgs.map((item) => item.id), clickedId: photo.id, anchorId, additive: event.metaKey || event.ctrlKey, range: event.shiftKey });
    setSelectedIds(next);
    if (selectionSourceRef.current === "adobe") showAdobeSelectionNotice();
    setAnchorId(photo.id);
    setFocusedId(photo.id);
    setFocusedPlainId(null);
    setPreviewSize(undefined);
  }, [anchorId, selectedIds, setSelectedIds, showAdobeSelectionNotice, visibleJpgs]);

  const moveFocus = useCallback((delta: number) => {
    if (!visibleJpgs.length) return;
    const current = focusedIndex >= 0 ? focusedIndex : 0;
    const nextIndex = Math.max(0, Math.min(visibleJpgs.length - 1, current + delta));
    const next = visibleJpgs[nextIndex];
    setFocusedId(next.id);
    setFocusedPlainId(null);
    setSelectedIds(new Set([next.id]));
    setAnchorId(next.id);
    setPreviewSize(undefined);
    document.querySelector<HTMLElement>(`[data-bridge-photo-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedIndex, setSelectedIds, visibleJpgs]);

  const moveGridFocus = useCallback((direction: BridgeGridDirection, extendRange = false) => {
    const fileArea = fileAreaRef.current;
    if (!fileArea || !visibleJpgs.length) return;
    const visibleIds = new Set(visibleJpgs.map((photo) => photo.id));
    const elements = Array.from(fileArea.querySelectorAll<HTMLElement>("[data-bridge-photo-id]"))
      .filter((element) => visibleIds.has(element.dataset.bridgePhotoId ?? ""));
    const targetId = bridgeGridNavigationTarget({
      currentId: focusedId,
      direction,
      items: elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          id: element.dataset.bridgePhotoId ?? "",
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
        };
      }).filter((item) => Boolean(item.id)),
    });
    if (!targetId || targetId === focusedId) return;
    setFocusedId(targetId);
    if (extendRange) {
      const orderedIds = visibleJpgs.map((photo) => photo.id);
      const rangeAnchor = anchorId && orderedIds.includes(anchorId) ? anchorId : focusedId && orderedIds.includes(focusedId) ? focusedId : targetId;
      setSelectedIds(bridgeKeyboardRangeSelection({ orderedIds, anchorId: rangeAnchor, targetId }));
      if (!anchorId) setAnchorId(rangeAnchor);
    } else {
      setSelectedIds(new Set([targetId]));
      setAnchorId(targetId);
    }
    setPreviewSize(undefined);
    elements.find((element) => element.dataset.bridgePhotoId === targetId)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [anchorId, focusedId, setSelectedIds, visibleJpgs]);

  const focusReviewPhoto = useCallback((id: string) => {
    setReviewActiveId(id);
    setFocusedId(id);
    setFocusedPlainId(null);
    setPreviewSize(undefined);
  }, []);

  const openSelectionReview = useCallback(() => {
    const first = focusedId && selectedIds.has(focusedId)
      ? focusedId
      : scan.jpgs.find((photo) => selectedIds.has(photo.id))?.id ?? null;
    if (!first) return;
    setReviewRemoved([]);
    setReviewActiveId(first);
    setFocusedId(first);
    setSelectionReviewOpen(true);
  }, [focusedId, scan.jpgs, selectedIds]);

  const closeSelectionReview = useCallback(() => {
    setSelectionReviewOpen(false);
    setReviewRemoved([]);
    setAnchorId(resolvedReviewActiveId);
    requestAnimationFrame(() => rootRef.current?.focus());
  }, [resolvedReviewActiveId]);

  const moveReview = useCallback((delta: -1 | 1) => {
    if (!reviewPhotos.length) return;
    const nextIndex = cycleBridgeReviewIndex(reviewActiveIndex, reviewPhotos.length, delta);
    const next = reviewPhotos[nextIndex];
    if (next) focusReviewPhoto(next.id);
  }, [focusReviewPhoto, reviewActiveIndex, reviewPhotos]);

  const removeReviewPhoto = useCallback(() => {
    const activeId = resolvedReviewActiveId;
    if (!activeId) return;
    if (selectionSourceRef.current === "adobe") {
      showAdobeSelectionNotice();
      return;
    }
    const result = removeBridgeReviewItem(reviewPhotos.map((photo) => photo.id), activeId);
    const removed = result.removed;
    if (!removed) return;
    const wasManual = manualSelectedIdsRef.current.has(activeId);
    const wasAdobe = adobeSelectedIdsRef.current.has(activeId);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(activeId);
      return next;
    });
    setReviewRemoved((current) => [...current, { ...removed, wasManual, wasAdobe }]);
    setReviewActiveId(result.nextActiveId);
    setFocusedId(result.nextActiveId);
  }, [resolvedReviewActiveId, reviewPhotos, setSelectedIds, showAdobeSelectionNotice]);

  const restoreReviewPhoto = useCallback(() => {
    const removed = reviewRemoved.at(-1);
    if (!removed) return;
    if (selectionSourceRef.current === "adobe") {
      showAdobeSelectionNotice();
      return;
    }
    const restored = restoreBridgeReviewItem(reviewPhotos.map((photo) => photo.id), removed);
    setSelectedIds((current) => new Set(current).add(removed.id));
    setReviewRemoved((current) => current.slice(0, -1));
    if (restored.activeId) focusReviewPhoto(restored.activeId);
  }, [focusReviewPhoto, reviewPhotos, reviewRemoved, setSelectedIds, showAdobeSelectionNotice]);

  const labelTargets = useCallback((focusedOnly = false) => {
    if (focusedOnly) return focusedId ? new Set([focusedId]) : new Set<string>();
    return selectedIds.size ? selectedIds : focusedId ? new Set([focusedId]) : new Set<string>();
  }, [focusedId, selectedIds]);

  const applyRating = useCallback((rating: number, focusedOnly = false) => {
    if (selectionSourceRef.current === "adobe") {
      showAdobeSelectionNotice();
      return;
    }
    const targets = labelTargets(focusedOnly);
    if (!targets.size) return;
    setRatingEdits((previous) => {
      const next = updateBridgeRatingEdits(previous, targets, rating);
      ratingEditsRef.current = next;
      return next;
    });
    setRatings((previous) => {
      const next = { ...previous };
      for (const id of targets) {
        if (rating === 0) delete next[id];
        else next[id] = rating;
      }
      ratingsRef.current = next;
      return next;
    });
    const ratingsByName = Object.fromEntries(scan.jpgs.flatMap((photo) => targets.has(photo.id) ? [[photo.name, rating] as const] : []));
    setJpgRatingsByName(ratingsByName, { overwrite: true });
  }, [labelTargets, scan.jpgs, setJpgRatingsByName, showAdobeSelectionNotice]);

  const applyColorLabel = useCallback((label: BridgeColorLabel, focusedOnly = false) => {
    const targets = labelTargets(focusedOnly);
    if (!targets.size) return;
    setColorLabels((previous) => toggleBridgeColorLabel(previous, targets, label));
  }, [labelTargets]);

  const clearColorLabels = useCallback(() => {
    const targets = labelTargets(false);
    if (!targets.size) return;
    setColorLabels((previous) => {
      const next = { ...previous };
      for (const id of targets) delete next[id];
      return next;
    });
  }, [labelTargets]);

  const toggleExcluded = useCallback((focusedOnly = false) => {
    const targets = labelTargets(focusedOnly);
    if (!targets.size) return;
    setExcludedIds((previous) => {
      const next = new Set(previous);
      const exclude = [...targets].some((id) => !next.has(id));
      for (const id of targets) {
        if (exclude) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, [labelTargets]);

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

  const selectAllVisibleJpgs = useCallback(() => {
    if (!visibleJpgs.length) return;
    const next = new Set(visibleJpgs.map((photo) => photo.id));
    setSelectedIds(next);
    const nextFocusedId = focusedId && next.has(focusedId) ? focusedId : visibleJpgs[0].id;
    setFocusedId(nextFocusedId);
    setFocusedPlainId(null);
    setAnchorId(nextFocusedId);
  }, [focusedId, setSelectedIds, visibleJpgs]);

  const closeCompactFilters = useCallback(() => {
    setCompactFiltersOpen(false);
    window.requestAnimationFrame(() => compactFilterButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!compactFiltersOpen) return;
    folderPanelRef.current?.focus();
  }, [compactFiltersOpen]);

  const handleKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && compactFiltersOpen) {
      event.preventDefault();
      closeCompactFilters();
      return;
    }
    if (event.key === "Escape" && (folderSourceOpen || nasPickerOpen || personSelectDialogOpen || gallerySelectDialogOpen || rawRootPromptOpen)) {
      event.preventDefault();
      setFolderSourceOpen(false);
      setNasPickerOpen(false);
      setPersonSelectDialogOpen(false);
      setGallerySelectDialogOpen(false);
      setRawRootPromptOpen(false);
      rootRef.current?.focus();
      return;
    }
    if (handleSearchFilterShortcut(event)) return;
    if (event.metaKey && !event.altKey && !event.ctrlKey) {
      if (event.code === "Equal" || event.key === "+" || event.key === "=") {
        event.preventDefault();
        resizeThumbnails(1);
        return;
      }
      if (event.code === "Minus" || event.key === "-" || event.key === "_") {
        event.preventDefault();
        resizeThumbnails(-1);
        return;
      }
    }
    if (isTypingTarget(event.target)) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === "KeyB") {
      event.preventDefault();
      if (!toolKey && !sceneReviewOpen && !selectionReviewOpen) openSelectionReview();
      return;
    }
    if (fullscreenPreviewOpen) {
      if (event.key === "Escape" || event.key === " ") {
        event.preventDefault();
        closeFullscreenPreview();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveFullscreenPreview(-1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveFullscreenPreview(1);
      } else if (/^[0-5]$/.test(event.key)) {
        event.preventDefault();
        applyRating(Number(event.key), true);
      } else if (/^[6-9]$/.test(event.key)) {
        event.preventDefault();
        applyColorLabel(Number(event.key) as BridgeColorLabel, true);
      } else if (event.key.toLocaleLowerCase("en-US") === "x") {
        event.preventDefault();
        toggleExcluded(true);
      }
      return;
    }
    if (selectionReviewOpen) {
      if (event.key === "Escape") { event.preventDefault(); closeSelectionReview(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); moveReview(-1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); moveReview(1); }
      else if (event.key === "ArrowDown") { event.preventDefault(); removeReviewPhoto(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); restoreReviewPhoto(); }
      else if (event.key === " ") { event.preventDefault(); openFullscreenPreview(); }
      else if (/^[0-5]$/.test(event.key)) { event.preventDefault(); applyRating(Number(event.key), true); }
      else if (/^[6-9]$/.test(event.key)) { event.preventDefault(); applyColorLabel(Number(event.key) as BridgeColorLabel, true); }
      else if (event.key.toLocaleLowerCase("en-US") === "x") { event.preventDefault(); toggleExcluded(true); }
      return;
    }
    if (event.key === "Escape") {
      if (sceneReviewOpen) setSceneReviewOpen(false);
      else if (toolKey) setToolKey(undefined);
      return;
    }
    if (toolKey || sceneReviewOpen) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === "KeyA") { event.preventDefault(); selectAllVisibleJpgs(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); moveGridFocus("left", event.shiftKey); }
    else if (event.key === "ArrowRight") { event.preventDefault(); moveGridFocus("right", event.shiftKey); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveGridFocus("up", event.shiftKey); }
    else if (event.key === "ArrowDown") { event.preventDefault(); moveGridFocus("down", event.shiftKey); }
    else if (event.key === " " && isSpaceShortcutTarget(event.target, event.currentTarget)) { event.preventDefault(); openFullscreenPreview(); }
    else if (/^[0-5]$/.test(event.key)) applyRating(Number(event.key));
    else if (/^[6-9]$/.test(event.key)) applyColorLabel(Number(event.key) as BridgeColorLabel);
    else if (event.key.toLocaleLowerCase("en-US") === "x" || (event.altKey && event.key === "Delete")) { event.preventDefault(); toggleExcluded(); }
  }, [applyColorLabel, applyRating, closeCompactFilters, closeFullscreenPreview, closeSelectionReview, compactFiltersOpen, folderSourceOpen, fullscreenPreviewOpen, gallerySelectDialogOpen, handleSearchFilterShortcut, moveFullscreenPreview, moveGridFocus, moveReview, nasPickerOpen, openFullscreenPreview, openSelectionReview, personSelectDialogOpen, rawRootPromptOpen, removeReviewPhoto, resizeThumbnails, restoreReviewPhoto, sceneReviewOpen, selectAllVisibleJpgs, selectionReviewOpen, toggleExcluded, toolKey]);

  const openTool = useCallback((key: ToolKey) => {
    if (!currentLocalFolder && !(remoteFolder && key === "classification")) return;
    const toolSelection = resolveBridgeToolSelection(selectedIdsRef.current, visibleJpgs.map((photo) => photo.id));
    if (!toolSelection.size) return;
    if (!selectedIdsRef.current.size) {
      setSelectedIds(toolSelection);
      setSelectedJpgFiles(visibleJpgs
        .filter((photo) => toolSelection.has(photo.id))
        .map((photo) => photo.file)
        .filter((file): file is File => Boolean(file)));
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

  const loadPersonSelectEvents = useCallback(async () => {
    setPersonSelectEventsLoading(true);
    setPersonSelectError("");
    try {
      const response = await fetch("/api/person-select", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; events?: PersonSelectEventSummary[]; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "개인별 사진 셀렉 행사를 불러오지 못했습니다.");
      setPersonSelectEvents(Array.isArray(body.events) ? body.events : []);
    } catch (error) {
      setPersonSelectError(error instanceof Error ? error.message : "개인별 사진 셀렉 행사를 불러오지 못했습니다.");
    } finally {
      setPersonSelectEventsLoading(false);
    }
  }, []);

  const openPersonSelectImport = useCallback(() => {
    if (!hasActiveFolder || scanStatus !== "ready") return;
    setPersonSelectDialogOpen(true);
    setPersonSelectResult(null);
    void loadPersonSelectEvents();
  }, [hasActiveFolder, loadPersonSelectEvents, scanStatus]);

  const closePersonSelectImport = useCallback(() => {
    setPersonSelectDialogOpen(false);
    setPersonSelectError("");
    setPersonSelectImportingId("");
    rootRef.current?.focus();
  }, []);

  const importPersonSelectEvent = useCallback(async (event: PersonSelectEventSummary) => {
    const manualCount = manualSelectedIdsRef.current.size;
    if (manualCount && !window.confirm(`지금 선택한 ${manualCount}장이 사라집니다. 계속할까요?`)) return;
    setPersonSelectImportingId(event.id);
    setPersonSelectError("");
    try {
      const response = await fetch(`/api/person-select/${event.id}/exports/selected`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; eventTitle?: string; fileNames?: unknown; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "고객 선택을 불러오지 못했습니다.");
      const fileNames = Array.isArray(body.fileNames) ? body.fileNames.filter((name): name is string => typeof name === "string") : [];
      const match = matchPersonSelectFileNames(fileNames, scan.jpgs.map((photo) => photo.name));
      setSelectedJpgNames(match.fileNames);
      setPersonSelectResult({ ...match, eventTitle: body.eventTitle || event.title });
    } catch (error) {
      setPersonSelectError(error instanceof Error ? error.message : "고객 선택을 불러오지 못했습니다.");
    } finally {
      setPersonSelectImportingId("");
    }
  }, [scan.jpgs, setSelectedJpgNames]);

  const loadSelectGalleries = useCallback(async () => {
    setSelectGalleriesLoading(true);
    setGallerySelectError("");
    try {
      const [galleryResponse, projectResponse] = await Promise.all([
        fetch("/api/select-galleries", { cache: "no-store" }),
        fetch("/api/person-select", { cache: "no-store" }),
      ]);
      const galleryBody = await galleryResponse.json().catch(() => ({})) as { ok?: boolean; galleries?: SelectGallerySummary[]; error?: string };
      const projectBody = await projectResponse.json().catch(() => ({})) as { ok?: boolean; events?: PersonSelectEventSummary[]; error?: string };
      if (!galleryResponse.ok || !galleryBody.ok) throw new Error(galleryBody.error || "사진선택 갤러리를 불러오지 못했습니다.");
      if (!projectResponse.ok || !projectBody.ok) throw new Error(projectBody.error || "공유 프로젝트를 불러오지 못했습니다.");
      setSelectGalleries(Array.isArray(galleryBody.galleries) ? galleryBody.galleries : []);
      setSharedSelectProjects((Array.isArray(projectBody.events) ? projectBody.events : []).filter((event) => event.access_mode === "project_shared"));
    } catch (error) {
      setGallerySelectError(error instanceof Error ? error.message : "사진선택 갤러리를 불러오지 못했습니다.");
    } finally {
      setSelectGalleriesLoading(false);
    }
  }, []);

  const openGallerySelectImport = useCallback(() => {
    if (!hasActiveFolder || scanStatus !== "ready") return;
    setGallerySelectDialogOpen(true);
    setGallerySelectError("");
    void loadSelectGalleries();
  }, [hasActiveFolder, loadSelectGalleries, scanStatus]);

  const closeGallerySelectImport = useCallback(() => {
    setGallerySelectDialogOpen(false);
    setGallerySelectImportingId("");
    setGallerySelectError("");
    rootRef.current?.focus();
  }, []);

  const importGalleryCustomerSelection = useCallback(async (gallery: SelectGallerySummary) => {
    setGallerySelectImportingId(gallery.id);
    setGallerySelectError("");
    try {
      const detailResponse = await fetch(`/api/select-galleries/${gallery.id}`, { cache: "no-store" });
      const detail = await detailResponse.json().catch(() => ({})) as {
        ok?: boolean;
        gallery?: SelectGallerySummary;
        images?: Array<{ id: string; original_file_name: string; relative_path?: string | null }>;
        selection?: { items?: Array<{ image_id: string; file_name: string; customer_rating?: number | null; memo?: string | null }> } | null;
        error?: string;
      };
      if (!detailResponse.ok || !detail.ok || !detail.gallery) throw new Error(detail.error || "갤러리 제출 결과를 불러오지 못했습니다.");
      const submittedItems = detail.selection?.items ?? [];
      if (!submittedItems.length) throw new Error("이 갤러리에 제출된 고객 셀렉이 없습니다.");
      const relativePathById = new Map((detail.images ?? []).map((image) => [image.id, image.relative_path ?? null]));
      const matchItems: CustomerSelectionMatchItem[] = submittedItems.map((item) => ({
        imageId: item.image_id,
        fileName: item.file_name,
        relativePath: relativePathById.get(item.image_id),
        rating: item.customer_rating,
        memo: item.memo,
      }));
      const match = matchCustomerSelectionToBridgeFiles(matchItems, scan.jpgs.map((photo) => ({
        id: photo.id,
        name: photo.name,
        relativeDirectory: photo.relativeDirectory,
      })));
      const linkResponse = await fetch(`/api/select-galleries/${gallery.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remoteFolder ? {
          bridge_source: "remote",
          bridge_folder_path: remoteFolder.path,
          bridge_folder_display_path: remoteFolder.displayPath,
        } : {
          bridge_source: "local",
          bridge_folder_path: null,
          bridge_folder_display_path: activeFolderName,
        }),
      });
      const linked = await linkResponse.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!linkResponse.ok || !linked.ok) throw new Error(linked.error || "갤러리와 현재 폴더를 연결하지 못했습니다.");

      setCustomerSelectedIds(new Set(match.matchedBridgeIds));
      setCustomerRatings(match.ratingsByBridgeId);
      setCustomerNotes(match.notesByBridgeId);
      setGalleryCustomerResult({ gallery: detail.gallery, total: submittedItems.length, match });
      setComparisonFilter("customer");
      try {
        localStorage.setItem(`olivia-bridge-gallery-folder:${gallery.id}`, JSON.stringify({
          source: remoteFolder ? "remote" : "local",
          displayPath: remoteFolder?.displayPath ?? activeFolderName,
        }));
      } catch (storageError) {
        if (process.env.NODE_ENV !== "production") console.debug("[olivia-bridge] gallery folder memory unavailable", storageError);
      }
    } catch (error) {
      setGallerySelectError(error instanceof Error ? error.message : "고객 셀렉을 불러오지 못했습니다.");
    } finally {
      setGallerySelectImportingId("");
    }
  }, [activeFolderName, remoteFolder, scan.jpgs]);

  const importSharedProjectSelection = useCallback(async (project: PersonSelectEventSummary) => {
    setGallerySelectImportingId(project.id);
    setGallerySelectError("");
    try {
      const response = await fetch(`/api/person-select/${project.id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        event?: { id: string; title: string; status: string };
        shared?: {
          images?: Array<{ id: string; original_file_name: string; relative_path?: string | null }>;
          selection?: { submitted_at?: string | null; items?: Array<{ image_id: string; customer_rating?: number | null; memo?: string | null; image?: { original_file_name: string; source_rel_path?: string | null } | null }> } | null;
        };
        error?: string;
      };
      if (!response.ok || !body.ok || !body.event) throw new Error(body.error || "공유 프로젝트 셀렉을 불러오지 못했습니다.");
      const selection = body.shared?.selection;
      const submittedItems = selection?.items ?? [];
      if (!selection?.submitted_at || !submittedItems.length) throw new Error("이 공유 프로젝트에 제출된 고객 셀렉이 없습니다.");
      const matchItems: CustomerSelectionMatchItem[] = submittedItems.flatMap((item) => item.image ? [{
        imageId: item.image_id,
        fileName: item.image.original_file_name,
        relativePath: item.image.source_rel_path ?? null,
        rating: item.customer_rating,
        memo: item.memo,
      }] : []);
      const match = matchCustomerSelectionToBridgeFiles(matchItems, scan.jpgs.map((photo) => ({
        id: photo.id,
        name: photo.name,
        relativeDirectory: photo.relativeDirectory,
      })));
      const imageMatch = matchCustomerSelectionToBridgeFiles((body.shared?.images ?? []).map((image) => ({
        imageId: image.id,
        fileName: image.original_file_name,
        relativePath: image.relative_path ?? null,
      })), scan.jpgs.map((photo) => ({
        id: photo.id,
        name: photo.name,
        relativeDirectory: photo.relativeDirectory,
      })));
      const qualityResponse = await fetch(`/api/person-select/${project.id}/quality`, { cache: "no-store" });
      const qualityBody = await qualityResponse.json().catch(() => ({})) as { ok?: boolean; results?: PublicPhotoQualityResult[]; job?: Record<string, unknown>; error?: string };
      if (qualityResponse.ok && qualityBody.ok) {
        setQualityByBridgeId(Object.fromEntries((qualityBody.results ?? []).flatMap((result) => {
          const bridgeId = imageMatch.bridgeIdByImageId[result.imageId];
          return bridgeId ? [[bridgeId, result]] : [];
        })));
        setQualityJob(qualityBody.job ?? null);
        setQualityMessage("");
      } else {
        setQualityByBridgeId({});
        setQualityJob(null);
        setQualityMessage(qualityBody.error || "AI 품질 결과를 불러오지 못했습니다.");
      }
      setCustomerSelectedIds(new Set(match.matchedBridgeIds));
      setCustomerRatings(match.ratingsByBridgeId);
      setCustomerNotes(match.notesByBridgeId);
      setGalleryCustomerResult({
        gallery: {
          id: body.event.id,
          title: body.event.title,
          status: body.event.status,
          selected_count: submittedItems.length,
          submitted_at: selection.submitted_at,
        },
        total: submittedItems.length,
        match,
        imageMatch,
        personSelectEventId: project.id,
      });
      setComparisonFilter("customer");
    } catch (error) {
      setGallerySelectError(error instanceof Error ? error.message : "공유 프로젝트 셀렉을 불러오지 못했습니다.");
    } finally {
      setGallerySelectImportingId("");
    }
  }, [scan.jpgs]);

  const startLinkedQualityAnalysis = useCallback(async () => {
    const eventId = galleryCustomerResult?.personSelectEventId;
    if (!eventId) return;
    if (!window.confirm("AI 품질 검사를 위해 1024px 이하 경량 미리보기를 OpenAI API로 전송합니다. 원본 파일은 전송하지 않습니다. 계속할까요?")) return;
    setQualityMessage("AI 품질 검사를 준비하는 중입니다.");
    const response = await fetch(`/api/person-select/${eventId}/quality`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consentAccepted: true }) });
    const body = await response.json().catch(() => ({})) as { ok?: boolean; job?: Record<string, unknown>; error?: string };
    if (!response.ok || !body.ok) { setQualityMessage(body.error || "AI 품질 검사를 시작하지 못했습니다."); return; }
    setQualityJob(body.job ?? null);
    setQualityMessage("Mac Studio에서 검사를 시작했습니다. 다른 앱을 사용해도 계속 진행됩니다.");
  }, [galleryCustomerResult?.personSelectEventId]);

  const controlLinkedQualityAnalysis = useCallback(async (action: "pause" | "resume" | "retry") => {
    const eventId = galleryCustomerResult?.personSelectEventId;
    if (!eventId) return;
    const response = await fetch(`/api/person-select/${eventId}/quality`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await response.json().catch(() => ({})) as { ok?: boolean; job?: Record<string, unknown>; error?: string };
    if (!response.ok || !body.ok) { setQualityMessage(body.error || "AI 검사 상태를 바꾸지 못했습니다."); return; }
    setQualityJob(body.job ?? null);
    setQualityMessage(action === "pause" ? "AI 검사를 일시정지했습니다." : action === "resume" ? "AI 검사를 이어서 진행합니다." : "실패한 사진만 다시 검사합니다.");
  }, [galleryCustomerResult?.personSelectEventId]);

  useEffect(() => {
    const eventId = galleryCustomerResult?.personSelectEventId;
    const match = galleryCustomerResult?.imageMatch ?? galleryCustomerResult?.match;
    if (!eventId || !match || !qualityJob || !["queued", "running"].includes(String(qualityJob.status ?? ""))) return;
    let stopped = false;
    let inFlight = false;
    const refresh = async () => {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch(`/api/person-select/${eventId}/quality?jobOnly=1`, { cache: "no-store" });
        const body = await response.json().catch(() => ({})) as { ok?: boolean; job?: Record<string, unknown> };
        if (!response.ok || !body.ok) return;
        setQualityJob(body.job ?? null);
        if (["queued", "running"].includes(String(body.job?.status ?? ""))) return;

        const resultResponse = await fetch(`/api/person-select/${eventId}/quality`, { cache: "no-store" });
        const resultBody = await resultResponse.json().catch(() => ({})) as { ok?: boolean; results?: PublicPhotoQualityResult[]; job?: Record<string, unknown> };
        if (!resultResponse.ok || !resultBody.ok) return;
        setQualityByBridgeId(Object.fromEntries((resultBody.results ?? []).flatMap((result) => {
          const bridgeId = match.bridgeIdByImageId[result.imageId];
          return bridgeId ? [[bridgeId, result]] : [];
        })));
        setQualityJob(resultBody.job ?? null);
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [galleryCustomerResult?.imageMatch, galleryCustomerResult?.match, galleryCustomerResult?.personSelectEventId, qualityJob]);

  const addCustomerSelectionToAdminSelection = useCallback(() => {
    if (!customerSelectedIds.size) return;
    setSelectedIds((current) => new Set([...current, ...customerSelectedIds]));
    setComparisonFilter("all");
  }, [customerSelectedIds, setSelectedIds]);

  useEffect(() => {
    setCustomerSelectedIds(new Set());
    setCustomerRatings({});
    setCustomerNotes({});
    setGalleryCustomerResult(null);
    setComparisonFilter("all");
  }, [folderPath]);

  useEffect(() => {
    let disposed = false;
    if (!activeFolder || !scan.folders.length) {
      setFolderImageCounts({});
      return;
    }
    void Promise.all(scan.folders.map(async (folder) => [
      folder.name.normalize("NFC"),
      await countBridgeFolderImages(folder),
    ] as const)).then((entries) => {
      if (!disposed) setFolderImageCounts(Object.fromEntries(entries));
    });
    return () => { disposed = true; };
  }, [activeFolder, scan.folders]);

  const clearMarqueePresentation = useCallback(() => {
    const fileArea = fileAreaRef.current;
    const marquee = marqueeRef.current;
    if (marquee) marquee.style.display = "none";
    if (!fileArea) return;
    delete fileArea.dataset.marqueeActive;
    fileArea.querySelectorAll<HTMLElement>("[data-bridge-photo-id]").forEach((element) => {
      delete element.dataset.marqueeSelected;
    });
  }, []);

  const paintMarquee = useCallback(() => {
    const session = marqueeSessionRef.current;
    const fileArea = fileAreaRef.current;
    const marquee = marqueeRef.current;
    if (!session || !fileArea || !marquee || !session.started) return;
    const rectangle = bridgeRectangleFromPoints(session.start, session.current);
    const hits = new Set(session.cards.filter((card) => bridgeRectanglesIntersect(rectangle, card.rectangle)).map((card) => card.id));
    const selection = bridgeMarqueeSelection({
      initial: session.initialSelection,
      hits,
      additive: session.additive,
    });
    session.currentSelection = selection;
    for (const card of session.cards) card.element.dataset.marqueeSelected = selection.has(card.id) ? "true" : "false";

    const areaBounds = fileArea.getBoundingClientRect();
    marquee.style.display = "block";
    marquee.style.width = `${rectangle.right - rectangle.left}px`;
    marquee.style.height = `${rectangle.bottom - rectangle.top}px`;
    marquee.style.transform = `translate3d(${rectangle.left - areaBounds.left + fileArea.scrollLeft}px, ${rectangle.top - areaBounds.top + fileArea.scrollTop}px, 0)`;
  }, []);

  const scheduleMarqueePaint = useCallback(() => {
    if (marqueeFrameRef.current !== null) return;
    marqueeFrameRef.current = requestAnimationFrame(() => {
      marqueeFrameRef.current = null;
      paintMarquee();
    });
  }, [paintMarquee]);

  const endMarquee = useCallback((event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const session = marqueeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (marqueeFrameRef.current !== null) {
      cancelAnimationFrame(marqueeFrameRef.current);
      marqueeFrameRef.current = null;
    }
    session.current = { x: event.clientX, y: event.clientY };
    if (session.started) paintMarquee();
    if (commit && session.started) {
      const nextSelection = new Set(session.currentSelection);
      setSelectedIds(nextSelection);
      const nextFocused = visibleJpgs.find((photo) => nextSelection.has(photo.id)) ?? null;
      setFocusedId(nextFocused?.id ?? null);
      setAnchorId(nextFocused?.id ?? null);
      setPreviewSize(undefined);
      suppressThumbnailClickRef.current = true;
      setTimeout(() => { suppressThumbnailClickRef.current = false; }, 0);
    }
    marqueeSessionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    requestAnimationFrame(clearMarqueePresentation);
  }, [clearMarqueePresentation, paintMarquee, setSelectedIds, visibleJpgs]);

  useEffect(() => () => {
    if (marqueeFrameRef.current !== null) cancelAnimationFrame(marqueeFrameRef.current);
  }, []);

  const selectionCounts = useMemo(() => scan.jpgs.reduce((counts, photo) => {
    const hasStar = matchesBridgeSelectionView(photo.id, "starred", effectiveRatings, effectiveColorLabels);
    const hasColor = matchesBridgeSelectionView(photo.id, "colored", effectiveRatings, effectiveColorLabels);
    if (hasStar) counts.starred += 1;
    if (hasColor) counts.colored += 1;
    if (hasStar || hasColor) counts.selected += 1;
    else counts.unselected += 1;
    return counts;
  }, { starred: 0, colored: 0, selected: 0, unselected: 0 }), [effectiveColorLabels, effectiveRatings, scan.jpgs]);
  const labeledCount = selectionCounts.selected;
  const selectedPhotos = useMemo(() => scan.jpgs.filter((photo) => selectedIds.has(photo.id)), [scan.jpgs, selectedIds]);
  const fullscreenPhoto = selectionReviewOpen ? reviewActivePhoto : focusedPhoto;
  const fullscreenIndex = selectionReviewOpen ? reviewActiveIndex : focusedIndex;
  const fullscreenTotal = selectionReviewOpen ? reviewPhotos.length : visibleJpgs.length;
  const adobeSelectedCount = selectionSource === "olivia" ? 0 : selectedPhotos.reduce((count, photo) => count + (adobeSelectedIdsRef.current.has(photo.id) ? 1 : 0), 0);
  const manualSelectedCount = selectionSource === "adobe" ? 0 : selectedPhotos.reduce((count, photo) => count + (manualSelectedIdsRef.current.has(photo.id) ? 1 : 0), 0);
  const selectedRatingValues = selectedPhotos.map((photo) => effectiveRatings[photo.id] ?? 0);
  const selectedColorValues = selectedPhotos.map((photo) => effectiveColorLabels[photo.id] ?? 0);
  const commonSelectedRating = selectedRatingValues.length && selectedRatingValues.every((rating) => rating === selectedRatingValues[0]) ? selectedRatingValues[0] : null;
  const commonSelectedColor = selectedColorValues.length && selectedColorValues.every((label) => label === selectedColorValues[0]) ? selectedColorValues[0] : null;
  const selectedRatingMixed = selectedRatingValues.length > 1 && commonSelectedRating === null;
  const selectedColorMixed = selectedColorValues.length > 1 && commonSelectedColor === null;
  const allSelectedExcluded = selectedPhotos.length > 0 && selectedPhotos.every((photo) => excludedIds.has(photo.id));
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
  const handleFileAreaClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressThumbnailClickRef.current) return;
    const photoCard = event.target instanceof Element
      ? event.target.closest("[data-bridge-photo-id]") as HTMLElement | null
      : null;
    if (photoCard) {
      if (isMacControlClick(event)) return;
      const photo = visiblePhotoById.get(photoCard.dataset.bridgePhotoId ?? "");
      if (photo) choosePhoto(photo, event);
      return;
    }
    setSelectedIds(new Set());
    setAnchorId(null);
    setFocusedId(null);
    setPreviewSize(undefined);
  }, [choosePhoto, setSelectedIds, visiblePhotoById]);
  const handleFileAreaContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isMacControlClick(event) || !(event.target instanceof Element)) return;
    const photoCard = event.target.closest<HTMLElement>("[data-bridge-photo-id]");
    const photo = photoCard ? visiblePhotoById.get(photoCard.dataset.bridgePhotoId ?? "") : undefined;
    if (!photo) return;
    event.preventDefault();
    choosePhoto(photo, event);
  }, [choosePhoto, visiblePhotoById]);
  const handleFileAreaPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType !== "mouse") return;
    marqueeSessionRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      additive: bridgeMarqueeUsesAdditiveSelection(event),
      initialSelection: new Set(selectedIds),
      currentSelection: new Set(selectedIds),
      started: false,
      cards: [],
    };
  }, [selectedIds]);
  const handleFileAreaPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = marqueeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.current = { x: event.clientX, y: event.clientY };
    if (!session.started) {
      const distance = Math.hypot(session.current.x - session.start.x, session.current.y - session.start.y);
      if (distance < 6) return;
      session.started = true;
      const fileArea = event.currentTarget;
      fileArea.setPointerCapture(event.pointerId);
      fileArea.dataset.marqueeActive = "true";
      session.cards = Array.from(fileArea.querySelectorAll<HTMLElement>("[data-bridge-photo-id]")).map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          id: element.dataset.bridgePhotoId ?? "",
          element,
          rectangle: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
        };
      }).filter((card) => Boolean(card.id));
    }
    event.preventDefault();
    scheduleMarqueePaint();
  }, [scheduleMarqueePaint]);
  const handleFileAreaPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    endMarquee(event, true);
  }, [endMarquee]);
  const handleFileAreaPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    endMarquee(event, false);
  }, [endMarquee]);

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
        onChooseAnother={() => { setGalleryCustomerResult(null); setComparisonFilter("all"); }}
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
        onChooseAnother={() => setPersonSelectResult(null)}
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
