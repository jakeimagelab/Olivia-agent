"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  File,
  Folder,
  FolderOpen,
  HardDrive,
  Images,
  LayoutGrid,
  Link2,
  LoaderCircle,
  Maximize2,
  Minus,
  Monitor,
  PencilLine,
  Plus,
  RefreshCw,
  Scaling,
  ScanSearch,
  Search,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  WandSparkles,
  X,
  type LucideIcon,
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
  BridgePreviewImage,
  BridgeSelectionReview,
  BridgeThumbnail,
  PlainFileCard,
  formatBridgeTimestamp,
  formatBytes,
} from "@/components/olivia-bridge/OliviaBridgeMedia";
import { BridgePaneDivider } from "@/components/olivia-bridge/OliviaBridgePaneDivider";
import PhotoQualityJobProgressView from "@/components/photo-quality/PhotoQualityJobProgress";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import {
  analyzeBridgeScenes,
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
  type BridgeScene,
  type BridgeSceneAnalysis,
} from "@/lib/photo-bridge/bridgeFiles";
import { createBridgeClassificationPlan } from "@/lib/photo-bridge/classificationPlan";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";
import { collectAdobeBridgeMarks, type AdobeBridgeMark } from "@/lib/selectMatch/bridgeRating";
import { fetchPhotoDepartmentContext } from "@/lib/photo-classifier/departmentContextClient";
import {
  manualPhotoDepartmentResolution,
  PHOTO_DEPARTMENT_SOURCE_DISPLAY,
} from "@/lib/photo-classifier/departmentResolver";
import { DEPARTMENT_DESCRIPTION, DEPARTMENT_DISPLAY, type MedicalDepartment } from "@/lib/photo-classifier/types";
import type { BridgeFloatingWindowRect } from "@/lib/photo-bridge/floatingWindow";
import { REMOTE_NAS_ROOT_NAME, type RemoteNasSelection } from "@/lib/remote-nas/types";
import { normalizeRemoteNasRelativePath, toRemoteNasDisplayPath } from "@/lib/remote-nas/path";
import { loadRemoteBridgeRatings } from "@/lib/photo-bridge/remoteRatings";
import { loadRemoteBridgeThumbnails } from "@/lib/photo-bridge/remoteThumbnails";
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
import { matchPersonSelectFileNames, type PersonSelectImportMatch } from "@/lib/photo-bridge/personSelectImport";
import {
  customerSelectionComparisonCounts,
  matchCustomerSelectionToBridgeFiles,
  matchesCustomerSelectionComparison,
  type CustomerSelectionComparisonFilter,
  type CustomerSelectionMatchItem,
  type CustomerSelectionMatchResult,
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
  type BridgeSelectionView,
} from "@/lib/photo-bridge/labels";
import { useBridgeSearchFilterShortcuts } from "@/lib/photo-bridge/useBridgeSearchFilterShortcuts";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { useDesktopWindowMode, useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import type { PhotoFileOpsMode, PhotoSelectMode, PhotoWorkspaceMode } from "@/components/photo-workspace/types";
import type { PhotoQualityFlag, PublicPhotoQualityResult } from "@/lib/photo-quality/types";
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
type SceneState = {
  status: "idle" | "running" | "complete" | "error";
  stage: string;
  completed: number;
  total: number;
  scenes: BridgeScene[];
  analysis: BridgeSceneAnalysis | null;
  error?: string;
};
type ToolKey = "jpg-prep" | "select" | "raw-match" | "classification" | "tcut" | "resize" | "rename" | "retouch";
type FileFilter = "all" | "jpg" | "raw" | "sidecar" | BridgeSelectionView | "excluded";
type QualityFilter = "all" | PhotoQualityFlag | "needs_review" | "normal";
type PreviewTab = "selection" | "preview" | "olivia";
type PersonSelectEventSummary = {
  id: string;
  title: string;
  people_count: number;
  submitted_count: number;
  access_mode?: "individual" | "project_shared";
  shared_submitted_at?: string | null;
};
type PersonSelectImportResult = PersonSelectImportMatch & { eventTitle: string };
type SelectGallerySummary = {
  id: string;
  title: string;
  hospital_name?: string | null;
  shooting_name?: string | null;
  status: string;
  selected_count?: number | null;
  submitted_at?: string | null;
  bridge_source?: "local" | "remote" | null;
  bridge_folder_display_path?: string | null;
};
type GalleryCustomerSelectionResult = {
  gallery: SelectGallerySummary;
  total: number;
  match: CustomerSelectionMatchResult;
  imageMatch?: CustomerSelectionMatchResult;
  personSelectEventId?: string;
};
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

const TOOL_ITEMS: Array<{
  key: ToolKey;
  label: string;
  icon: LucideIcon;
  mode: PhotoWorkspaceMode;
  selectMode?: PhotoSelectMode;
  fileOpsMode?: PhotoFileOpsMode;
}> = [
  { key: "jpg-prep", label: "JPG 정리", icon: Images, mode: "jpg-prep" },
  { key: "select", label: "사진 셀렉", icon: Check, mode: "select", selectMode: "manual" },
  { key: "raw-match", label: "RAW 매칭", icon: Link2, mode: "raw-match" },
  { key: "tcut", label: "T컷 정리", icon: Scissors, mode: "select", selectMode: "tcut" },
  { key: "resize", label: "리사이즈", icon: Scaling, mode: "file-ops", fileOpsMode: "resize" },
  { key: "rename", label: "이름변경", icon: PencilLine, mode: "file-ops", fileOpsMode: "rename" },
  { key: "retouch", label: "사진 보정", icon: WandSparkles, mode: "retouch" },
  { key: "classification", label: "사진 분류", icon: ScanSearch, mode: "classification" },
];

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
  const [captureMetadataState, setCaptureMetadataState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    completed: number;
    total: number;
    fallbackCount: number;
  }>({ status: "idle", completed: 0, total: 0, fallbackCount: 0 });
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
  const [sceneState, setSceneState] = useState<SceneState>({ status: "idle", stage: "폴더를 선택해 주세요", completed: 0, total: 0, scenes: [], analysis: null });
  const [sceneRunKey, setSceneRunKey] = useState(0);
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [departmentError, setDepartmentError] = useState("");
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
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
  const [previewTab, setPreviewTab] = useState<PreviewTab>("selection");
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
  const activeTool = TOOL_ITEMS.find((item) => item.key === toolKey);

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
        const nextRatings: Record<string, number> = {};
        const nextColors: BridgeColorLabels = {};
        const nextRawMarks: Record<string, AdobeBridgeMark> = {};
        const nextAdobeIds = new Set<string>();
        const rated = remote.ratings.filter((mark) => mark.rating !== null).length;
        const colored = remote.ratings.filter((mark) => mark.colorLabel !== null).length;
        for (const photo of scan.jpgs) {
          const mark = byKey.get(normalizePhotoToolFileKey(photo.name));
          if (!mark) continue;
          if (mark.rating) nextRatings[photo.id] = mark.rating;
          if (mark.colorLabel) nextColors[photo.id] = mark.colorLabel;
          nextAdobeIds.add(photo.id);
        }
        for (const raw of scan.raws) {
          const mark = byKey.get(normalizePhotoToolFileKey(raw.name));
          if (mark) nextRawMarks[raw.id] = { rating: mark.rating, colorLabel: mark.colorLabel };
        }
        setAdobeRatings(nextRatings);
        setAdobeColorLabels(nextColors);
        setRawAdobeMarks(nextRawMarks);
        setAdobeMarkStatus({ read: remote.scanned, total: remote.scanned, rated, colored, failed: 0, failedFileNames: [], firstError: null });
        adobeRatingsRef.current = nextRatings;
        adobeColorLabelsRef.current = nextColors;
        publishRatingsForSource(selectionSourceRef.current, nextRatings);
        commitSelectedIds(manualSelectedIdsRef.current, nextAdobeIds);
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
      const nextRatings: Record<string, number> = {};
      const nextColors: BridgeColorLabels = {};
      const nextRawMarks: Record<string, AdobeBridgeMark> = {};
      const nextAdobeIds = new Set<string>();
      // 파일명 기준 공용 저장소에도 넣는다. 손으로 준 별점은 applyRating이 넣고 있는데
      // 어도비에서 읽어온 별점만 빠져 있어서, RAW 매칭·사진 셀렉이 그 별점을 못 받았다.
      for (const photo of scan.jpgs) {
        const mark = found.marks.get(normalizePhotoToolFileKey(photo.name));
        if (!mark) continue;
        if (mark.rating) nextRatings[photo.id] = mark.rating;
        if (mark.colorLabel) nextColors[photo.id] = mark.colorLabel;
        nextAdobeIds.add(photo.id);
      }
      for (const raw of scan.raws) {
        const mark = found.marks.get(normalizePhotoToolFileKey(raw.name));
        if (mark) nextRawMarks[raw.id] = mark;
      }
      setAdobeRatings(nextRatings);
      setAdobeColorLabels(nextColors);
      setRawAdobeMarks(nextRawMarks);
      setAdobeMarkStatus({
        read: found.read,
        total: found.total,
        rated: found.rated,
        colored: found.colored,
        failed: found.failed,
        failedFileNames: found.failedFileNames,
        firstError: found.firstError,
      });
      adobeRatingsRef.current = nextRatings;
      adobeColorLabelsRef.current = nextColors;
      publishRatingsForSource(selectionSourceRef.current, nextRatings);
      commitSelectedIds(manualSelectedIdsRef.current, nextAdobeIds);
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

  useEffect(() => {
    if (!hasActiveFolder || scanStatus !== "ready") {
      setSceneState({ status: "idle", stage: "폴더를 선택해 주세요", completed: 0, total: 0, scenes: [], analysis: null });
      return;
    }
    if (!scan.jpgs.length) {
      setSceneState({ status: "complete", stage: "분석할 JPG가 없습니다", completed: 0, total: 0, scenes: [], analysis: null });
      return;
    }
    const controller = new AbortController();
    setSceneState({ status: "running", stage: "AI Scene 사전 분석 준비", completed: 0, total: scan.jpgs.length, scenes: [], analysis: null });
    void analyzeBridgeScenes({
      folderKey: folderPath,
      jpgs: scan.jpgs,
      signal: controller.signal,
      onProgress: (completed, total, stage) => setSceneState((previous) => ({ ...previous, status: "running", completed, total, stage })),
    }).then((analysis) => setSceneState({ status: "complete", stage: "Scene 분류 계획 준비됨", completed: scan.jpgs.length, total: scan.jpgs.length, scenes: analysis.scenes, analysis }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSceneState({ status: "error", stage: "Scene 분석 오류", completed: 0, total: scan.jpgs.length, scenes: [], analysis: null, error: error instanceof Error ? error.message : "Scene 분석에 실패했습니다." });
      });
    return () => controller.abort();
  }, [folderPath, hasActiveFolder, scan.jpgs, scanStatus, sceneRunKey]);

  useEffect(() => {
    if (!hasActiveFolder || !activeFolderName || scanStatus !== "ready") return;
    const controller = new AbortController();
    setDepartmentLoading(true);
    setDepartmentError("");
    setDepartmentPickerOpen(false);
    void fetchPhotoDepartmentContext({ clientId, workflowRunId, folderName: activeFolderName }, { signal: controller.signal })
      .then((resolution) => {
        setPhotoDepartmentResolution(resolution);
        setDepartmentPickerOpen(resolution.status !== "resolved");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPhotoDepartmentResolution({ status: "unknown", evidence: [] });
        setDepartmentPickerOpen(true);
        setDepartmentError(error instanceof Error ? error.message : "진료과 정보를 확인하지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDepartmentLoading(false);
      });
    return () => controller.abort();
  }, [activeFolderName, clientId, hasActiveFolder, scanStatus, setPhotoDepartmentResolution, workflowRunId]);

  const chooseDepartment = useCallback((department: MedicalDepartment) => {
    setPhotoDepartmentResolution(manualPhotoDepartmentResolution(department));
    setDepartmentError("");
    setDepartmentPickerOpen(false);
  }, [setPhotoDepartmentResolution]);

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
      setSceneState((previous) => ({
        ...previous,
        status: "error",
        stage: "Scene 계획 적용 오류",
        error: error instanceof Error ? error.message : "Scene 계획을 적용하지 못했습니다.",
      }));
    }
  }, [activeFolder, folderPath, hasActiveFolder, photoDepartmentResolution, scenePlanReady, selectedSceneAnalysis, stageBridgeClassificationPlan]);

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
        <aside ref={folderPanelRef} id="olivia-bridge-folder-panel" className={styles.folderPanel} data-compact-open={compactFiltersOpen ? "true" : "false"} tabIndex={-1} aria-label="폴더와 파일 필터">
          <div className={styles.panelTitle}><span>폴더와 필터</span><button type="button" className={styles.compactFilterClose} onClick={closeCompactFilters} aria-label="필터 닫기"><X size={15} /></button></div>
          <div className={styles.folderPanelScroll}>
          <button type="button" className={styles.rootFolder} onClick={() => breadcrumbs[0] && void loadDirectory(breadcrumbs[0].handle, breadcrumbs.slice(0, 1))} disabled={!breadcrumbs[0]}><FolderOpen size={17} /><span>{breadcrumbs[0]?.name ?? "촬영 폴더"}</span><b>{scan.jpgs.length + scan.raws.length + scan.sidecars.length}</b></button>
          <label className={styles.nestedJpgToggle}>
            <input
              type="checkbox"
              checked={includeNestedJpgs}
              disabled={!activeFolder || scanStatus === "loading"}
              onChange={(event) => changeNestedJpgVisibility(event.currentTarget.checked)}
            />
            <span>하위 폴더 JPG 포함</span>
            {scan.nestedJpgCount ? <b>{scan.nestedJpgCount.toLocaleString("ko-KR")}</b> : null}
          </label>
          <div className={styles.filterList}>
            <small>파일 필터</small>
            {fileFilters.map((filter) => <button key={filter.key} type="button" data-zero={filter.count === 0 ? "true" : undefined} className={!hasLabelFilters && fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => chooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count.toLocaleString("ko-KR")}</b></button>)}
            <small>셀렉 보기</small>
            {selectionFilters.map((filter) => <button key={filter.key} type="button" data-zero={filter.count === 0 ? "true" : undefined} className={!hasLabelFilters && fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => chooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count.toLocaleString("ko-KR")}</b></button>)}
            <small>고객 셀렉 비교{galleryCustomerResult ? ` · ${galleryCustomerResult.gallery.title}` : ""}</small>
            {([
              ["all", "전체"],
              ["admin", "내 셀렉"],
              ["customer", "고객 셀렉"],
              ["common", "공통 셀렉"],
              ["admin-only", "나만 선택"],
              ["customer-only", "고객만 선택"],
            ] as Array<[CustomerSelectionComparisonFilter, string]>).map(([key, label]) => <button key={key} type="button" disabled={key !== "all" && !galleryCustomerResult} data-zero={comparisonCounts[key] === 0 ? "true" : undefined} className={comparisonFilter === key ? styles.activeFilter : ""} onClick={() => setComparisonFilter(key)}><span>{label}</span><b>{comparisonCounts[key].toLocaleString("ko-KR")}</b></button>)}
            <small>AI 품질 검사</small>
            {([
              ["all", "전체 사진"],
              ["eyes_closed", "눈감음 의심"],
              ["face_too_dark", "얼굴 어두움 의심"],
              ["motion_blur", "흔들림 의심"],
              ["needs_review", "확인 필요"],
              ["normal", "정상"],
            ] as Array<[QualityFilter, string]>).map(([key, label]) => <button key={key} type="button" disabled={key !== "all" && !galleryCustomerResult?.personSelectEventId} data-zero={key !== "all" && qualityCounts[key] === 0 ? "true" : undefined} className={qualityFilter === key ? styles.activeFilter : ""} onClick={() => setQualityFilter(key)}><span>{label}</span><b>{key === "all" ? scan.jpgs.length.toLocaleString("ko-KR") : qualityCounts[key].toLocaleString("ko-KR")}</b></button>)}
            {galleryCustomerResult?.personSelectEventId ? <button type="button" disabled={["queued", "running", "paused"].includes(String(qualityJob?.status ?? ""))} onClick={() => void startLinkedQualityAnalysis()}><span><Sparkles size={12} />{["queued", "running"].includes(String(qualityJob?.status ?? "")) ? "검사 진행 중" : qualityJob?.status === "paused" ? "검사 일시정지" : "AI 검사 시작"}</span><b>{qualityJob ? `${Number(qualityJob.completed_count ?? 0)}/${Number(qualityJob.total_count ?? 0)}` : ""}</b></button> : null}
            <PhotoQualityJobProgressView job={qualityJob} />
            {qualityJob && ["queued", "running"].includes(String(qualityJob.status ?? "")) ? <button type="button" onClick={() => void controlLinkedQualityAnalysis("pause")}><span>검사 일시정지</span></button> : null}
            {qualityJob?.status === "paused" ? <button type="button" onClick={() => void controlLinkedQualityAnalysis("resume")}><span>검사 계속</span></button> : null}
            {qualityJob && ["failed", "partial_failed"].includes(String(qualityJob.status ?? "")) ? <button type="button" onClick={() => void controlLinkedQualityAnalysis("retry")}><span>실패 사진 재시도</span></button> : null}
            {qualityMessage ? <p>{qualityMessage}</p> : null}
          </div>
          <div className={styles.folderList}>
            {scan.folders.length ? <small>하위 폴더</small> : null}
            {scan.folders.map((folder) => <button key={folder.name} type="button" onClick={() => void loadDirectory(folder, [...breadcrumbs, { name: folder.name, handle: folder }])}><Folder size={15} /><span>{folder.name}</span><b>{(folderImageCounts[folder.name.normalize("NFC")] ?? 0).toLocaleString("ko-KR")}</b><ChevronRight size={12} /></button>)}
            {activeFolder && !scan.folders.length ? <p>하위 폴더가 없습니다.</p> : null}
          </div>
          </div>
          <div className={styles.folderSummary}><span>선택 <b>{selectedIds.size}</b></span><span>레이블 <b>{labeledCount}</b></span><span>제외 <b>{excludedIds.size}</b></span></div>
          <label className={styles.folderThumbnailGauge} title="썸네일 크기">
            <span>썸네일 크기</span>
            <input type="range" min={THUMBNAIL_SIZE_MIN} max={THUMBNAIL_SIZE_MAX} step={THUMBNAIL_SIZE_STEP} value={thumbnailSize} onChange={(event) => setThumbnailSize(Number(event.currentTarget.value))} aria-label="썸네일 크기" />
            <small>⌘ + / - 로도 조절</small>
          </label>
        </aside>

        <BridgePaneDivider
          pane="folder"
          workspaceRef={workspaceRef}
          oppositePaneRef={previewPanelRef}
          controls="olivia-bridge-folder-panel"
          label="폴더 영역 너비 조절"
        />

        <section id="olivia-bridge-file-panel" className={styles.browserPanel} aria-label="현재 폴더 파일">
          <div className={styles.browserHeader}>
            <div className={styles.browserTitle}>
              <strong>{activeFolder?.name ?? "폴더 내용"}</strong>
              <span>{filenameSearchTokens.length ? `검색 ${visibleJpgs.length.toLocaleString("ko-KR")}장` : `${centerFileCount.toLocaleString("ko-KR")}개의 파일${scan.nestedJpgCount ? ` · 하위 JPG ${scan.nestedJpgCount.toLocaleString("ko-KR")}장` : ""}`}</span>
              {activeRatingFilterName ? <button type="button" className={styles.filterChip} onClick={() => applyLabelFilterCommand({ kind: "rating", rating: labelFilters.rating! })}>{activeRatingFilterName}<X size={11} /></button> : null}
              {activeColorFilterName ? <button type="button" className={styles.filterChip} onClick={() => applyLabelFilterCommand({ kind: "color", label: labelFilters.color! })}>{activeColorFilterName}<X size={11} /></button> : null}
              {jpgSortMode === "capture" ? <span className={styles.captureMetadataStatus} role="status">{captureMetadataState.status === "loading" ? `촬영시각 ${captureMetadataState.completed.toLocaleString("ko-KR")}/${captureMetadataState.total.toLocaleString("ko-KR")}` : captureMetadataState.status === "error" ? "촬영시각 읽기 실패" : captureMetadataState.status === "ready" && captureMetadataState.fallbackCount ? `EXIF 없음 ${captureMetadataState.fallbackCount.toLocaleString("ko-KR")}장 · 수정시각 사용` : "EXIF 촬영순"}</span> : null}
            </div>
            <div className={styles.browserActions}>
              <div className={styles.photoSortControl} aria-label="사진 표시 순서">
                <span>정렬</span>
                <button type="button" data-active={jpgSortMode === "filename"} onClick={() => setJpgSortMode("filename")}>파일명</button>
                <button type="button" data-active={jpgSortMode === "capture"} onClick={() => setJpgSortMode("capture")}>촬영순</button>
              </div>
              <button type="button" className={styles.compactPreviewButton} onClick={() => setCompactPreviewOpen(true)} aria-label="미리보기 열기"><Maximize2 size={15} /> 미리보기</button>
              <label className={styles.filenameSearch}>
                <Search size={13} aria-hidden="true" />
                <input ref={searchInputRef} type="search" value={filenameSearch} onChange={(event) => setFilenameSearch(event.currentTarget.value)} placeholder="파일명 검색" aria-label="파일명 검색" />
                {filenameSearch ? <button type="button" onClick={() => { setFilenameSearch(""); searchInputRef.current?.focus(); }} aria-label="검색 지우기"><X size={12} /></button> : <kbd>⌘F</kbd>}
              </label>
              <div className={styles.thumbnailControls}><button type="button" onClick={() => resizeThumbnails(-1)} aria-label="썸네일 작게"><Minus size={15} /></button><LayoutGrid size={16} aria-hidden="true" /><button type="button" onClick={() => resizeThumbnails(1)} aria-label="썸네일 크게"><Plus size={15} /></button></div>
            </div>
          </div>

          {scanStatus === "idle" ? <div className={styles.emptyState}><FolderOpen size={34} /><strong>{restoreTrail.length ? "지난 작업 폴더를 다시 열까요?" : "촬영 폴더를 선택해 주세요"}</strong><p>{restoreMessage || "JPG는 썸네일로, RAW와 사이드카는 파일 정보로 표시합니다."}</p>{restoreTrail.length ? <div className={styles.restoreActions}><button type="button" onClick={() => void restoreLastFolder()}>지난 폴더 다시 열기</button></div> : null}</div> : null}
          {scanStatus === "restoring" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>지난 작업 폴더를 확인하는 중입니다</strong><p>권한이 유지되어 있으면 마지막 폴더를 그대로 엽니다.</p></div> : null}
          {scanStatus === "loading" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>폴더를 읽는 중입니다</strong><p>화면에 필요한 JPG부터 썸네일을 만듭니다.</p></div> : null}
          {scanStatus === "error" ? <div className={styles.emptyState}><CircleAlert size={30} /><strong>폴더를 읽지 못했습니다</strong><p>폴더가 옮겨졌거나 이름이 바뀌었을 수 있습니다. 다시 골라 주세요.</p></div> : null}
          {scanStatus === "ready" ? (
            <div
              ref={fileAreaRef}
              className={styles.fileArea}
              onClickCapture={(event) => {
                if (!suppressThumbnailClickRef.current) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                if (suppressThumbnailClickRef.current) return;
                if (event.target instanceof Element && event.target.closest("[data-bridge-photo-id]")) return;
                setSelectedIds(new Set());
                setAnchorId(null);
                setFocusedId(null);
                setPreviewSize(undefined);
              }}
              onPointerDown={(event) => {
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
              }}
              onPointerMove={(event) => {
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
              }}
              onPointerUp={(event) => endMarquee(event, true)}
              onPointerCancel={(event) => endMarquee(event, false)}
            >
              <div ref={marqueeRef} className={styles.selectionMarquee} aria-hidden="true" />
              {visibleJpgs.length ? <div data-bridge-thumbnail-grid className={styles.thumbnailGrid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))` }}>
                {visibleJpgs.map((photo) => {
                  const selected = selectedIds.has(photo.id);
                  const customerSelected = customerSelectedIds.has(photo.id);
                  const focused = focusedId === photo.id;
                  const adobeSelected = selectionSource !== "olivia" && selected && adobeSelectedIdsRef.current.has(photo.id);
                  const manualSelected = selectionSource !== "adobe" && selected && manualSelectedIdsRef.current.has(photo.id);
                  const excluded = excludedIds.has(photo.id);
                  const rating = effectiveRatings[photo.id] ?? 0;
                  const colorLabel = effectiveColorLabels[photo.id];
                  const color = colorLabel ? BRIDGE_COLOR_LABELS[colorLabel] : null;
                  const quality = qualityByBridgeId[photo.id];
                  const rawMark = rawMarkByFileKey.get(normalizePhotoToolFileKey(photo.name));
                  const rawColor = rawMark?.colorLabel ? BRIDGE_COLOR_LABELS[rawMark.colorLabel] : null;
                  return <button key={photo.id} type="button" data-bridge-photo-id={photo.id} data-nested={photo.relativeDirectory ? "true" : "false"} data-selection-source={adobeSelected ? "adobe" : manualSelected ? "manual" : "none"} className={`${styles.thumbnailCard} ${selected ? styles.selected : ""} ${adobeSelected ? styles.adobeSelected : ""} ${manualSelected ? styles.manualSelected : ""} ${focused ? styles.focused : ""} ${excluded ? styles.excluded : ""}`} onClick={(event) => { if (isMacControlClick(event)) return; choosePhoto(photo, event); }} onContextMenu={(event) => { if (!isMacControlClick(event)) return; event.preventDefault(); choosePhoto(photo, event); }} aria-label={`${photo.name}${adobeSelected ? ", Adobe 선택" : manualSelected ? ", 직접 선택" : ""}${customerSelected ? ", 고객 선택" : ""}${focused ? ", 현재 포커스" : ""}`} aria-pressed={selected}><BridgeThumbnail photo={photo} alt={photo.name} />{adobeSelected ? <span className={styles.sourceBadge}>Adobe</span> : null}{selected ? <span className={styles.adminSelectionBadge}>내 셀렉</span> : null}{customerSelected ? <span className={styles.customerSelectionBadge}>고객{customerRatings[photo.id] ? ` ★${customerRatings[photo.id]}` : ""}</span> : null}{quality && (quality.flags.length || quality.status === "needs_review") ? <span className={styles.aiQualityBadge}><CircleAlert size={11} />{quality.flags.length || "?"}</span> : null}<span className={styles.photoName}>{photo.name}</span>{photo.relativeDirectory ? <span className={styles.photoPath}>{photo.relativeDirectory}</span> : null}{rawMark?.rating ? <span className={styles.rawMarkBadge}>RAW ★{rawMark.rating}</span> : null}{rawColor ? <span className={styles.rawColorBadge}><i style={{ background: rawColor.color }} />RAW {rawColor.name}</span> : null}{rating ? <span className={styles.rating}><Star size={11} fill="currentColor" />{rating}</span> : null}{color ? <span className={styles.colorLabelMark} style={{ background: color.color }} aria-label={`${color.name} 컬러 레이블`} /> : null}{excluded ? <span className={styles.rejectMark}>X</span> : null}</button>;
                })}
              </div> : null}
              {showRaws && scan.raws.length ? <section className={styles.plainFileSection}><header><strong>RAW</strong><span>미리보기 없이 형식과 파일명만 표시</span></header><div>{scan.raws.map((file) => <PlainFileCard key={file.id} file={file} mark={rawAdobeMarks[file.id]} active={focusedPlainFile?.id === file.id} onClick={() => { setFocusedPlainId(file.id); setFocusedId(null); }} />)}</div></section> : null}
              {showSidecars && scan.sidecars.length ? <section className={styles.plainFileSection}><header><strong>사이드카</strong><span>원본과 함께 유지되는 설정 파일</span></header><div>{scan.sidecars.map((file) => <PlainFileCard key={file.id} file={file} active={focusedPlainFile?.id === file.id} onClick={() => { setFocusedPlainId(file.id); setFocusedId(null); }} />)}</div></section> : null}
              {!visibleJpgs.length && (!showRaws || !scan.raws.length) && (!showSidecars || !scan.sidecars.length) ? <div className={styles.noPhotos}><Images size={27} /><span>이 조건에 맞는 파일이 없습니다.</span></div> : null}
            </div>
          ) : null}
        </section>


        <BridgePaneDivider
          pane="preview"
          workspaceRef={workspaceRef}
          oppositePaneRef={folderPanelRef}
          controls="olivia-bridge-preview-panel"
          label="미리보기 영역 너비 조절"
        />

        <aside ref={previewPanelRef} id="olivia-bridge-preview-panel" className={styles.previewPanel} aria-label="선택한 사진 미리보기">
          <header className={styles.previewHeader}><strong>선택한 파일</strong><button type="button" className={styles.compactPreviewClose} onClick={() => setCompactPreviewOpen(false)} aria-label="미리보기 닫기"><X size={15} /></button><LayoutGrid size={15} aria-hidden="true" /></header>
          <div className={styles.previewTabs} role="tablist" aria-label="선택한 파일 패널">
            <button type="button" role="tab" aria-selected={previewTab === "selection"} onClick={() => setPreviewTab("selection")}>선택한 파일</button>
            <button type="button" role="tab" aria-selected={previewTab === "preview"} onClick={() => setPreviewTab("preview")}>미리보기</button>
            <button type="button" role="tab" aria-selected={previewTab === "olivia"} onClick={() => setPreviewTab("olivia")}>Olivia</button>
          </div>
          {previewTab === "selection" ? (
            <div className={styles.selectionInspector}>
              <section className={styles.selectionInspectorSummary}>
                <div><strong>{selectedPhotos.length}장</strong><span> 선택됨</span></div>
                <small className={styles.selectionSourceLabel}>기준: {selectionSource === "olivia" ? "올리비아" : selectionSource === "adobe" ? "어도비" : "둘 다"}</small>
                <p>마지막으로 고른 것 · {focusedPhoto?.name ?? focusedPlainFile?.name ?? "없음"}</p>
                <div className={styles.selectionSourceCounts}><span>Adobe {adobeSelectedCount}장</span><span>직접 고름 {manualSelectedCount}장</span></div>
                {focusedPhoto && customerSelectedIds.has(focusedPhoto.id) ? <div className={styles.customerSelectionFocus}><b>고객 셀렉{customerRatings[focusedPhoto.id] ? ` · ${customerRatings[focusedPhoto.id]}점` : ""}</b>{customerNotes[focusedPhoto.id] ? <span>{customerNotes[focusedPhoto.id]}</span> : null}</div> : null}
                {focusedPhoto && qualityByBridgeId[focusedPhoto.id] ? <div className={styles.aiQualityFocus}><b>AI 품질 분석 · {qualityByBridgeId[focusedPhoto.id].reviewStatus === "confirmed_normal" ? "정상 확인됨" : qualityByBridgeId[focusedPhoto.id].reviewStatus === "confirmed_issue" ? "문제 확인됨" : qualityByBridgeId[focusedPhoto.id].status === "needs_review" ? "확인 필요" : qualityByBridgeId[focusedPhoto.id].flags.length ? "문제 의심" : "정상"}</b><span>{qualityByBridgeId[focusedPhoto.id].flags.map((flag) => flag === "eyes_closed" ? "눈감음" : flag === "face_too_dark" ? "얼굴 어두움" : "흔들림").join(" · ") || "감지된 문제 없음"}</span><small>AI 결과는 별점·셀렉·파일을 자동 변경하지 않습니다.</small></div> : null}
              </section>
              <section className={styles.bulkControl} aria-label="선택한 사진 별점">
                <header><span>앱에 별점 적용</span>{selectedRatingMixed ? <b>혼합</b> : <b>{commonSelectedRating ? `${commonSelectedRating}점` : "없음"}</b>}</header>
                <div className={styles.bulkRatingButtons}>{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" disabled={!selectedPhotos.length} aria-label={`선택 사진에 ${rating}점 적용`} aria-pressed={!selectedRatingMixed && commonSelectedRating === rating} onClick={() => applyRating(rating)}><Star size={17} fill={!selectedRatingMixed && commonSelectedRating === rating ? "currentColor" : "none"} /></button>)}</div>
                <button type="button" className={styles.clearBulkButton} disabled={!selectedPhotos.length} onClick={() => applyRating(0)}>별점 해제</button>
                <small>Adobe에서 별점을 불러와도 앱에서 편집한 값은 유지됩니다.</small>
              </section>
              <section className={styles.bulkControl} aria-label="선택한 사진 컬러 레이블">
                <header><span>컬러 레이블</span>{selectedColorMixed ? <b>혼합</b> : <b>{commonSelectedColor ? BRIDGE_COLOR_LABELS[commonSelectedColor as BridgeColorLabel].name : "없음"}</b>}</header>
                <div className={styles.bulkColorButtons}>{(Object.entries(BRIDGE_COLOR_LABELS) as Array<[string, { name: string; color: string }]>).map(([label, value]) => <button key={label} type="button" disabled={!selectedPhotos.length} aria-label={`${value.name} 레이블`} aria-pressed={!selectedColorMixed && commonSelectedColor === Number(label)} style={{ background: value.color }} onClick={() => applyColorLabel(Number(label) as BridgeColorLabel)} />)}<button type="button" className={styles.clearColorButton} disabled={!selectedPhotos.length} aria-label="컬러 레이블 해제" onClick={clearColorLabels}><X size={14} /></button></div>
              </section>
              <div className={styles.selectionInspectorActions}>
                <button type="button" disabled={!selectedPhotos.length} onClick={() => toggleExcluded()}>{allSelectedExcluded ? "선택 파일 제외 해제" : "선택 파일 제외"}</button>
                <button type="button" disabled={!focusedPhoto} onClick={openFullscreenPreview}><Maximize2 size={13} /> 크게 보기</button>
              </div>
            </div>
          ) : previewTab === "olivia" ? (
            <div className={styles.previewOlivia}><div><strong>{folderPath || "폴더 미선택"}</strong><span>{focusedPhoto?.name ?? focusedPlainFile?.name ?? "파일 미선택"} · 선택 JPG {selectedNames.length}장</span></div><OliviaChatDockTarget id="olivia-bridge-preview" priority={92} className={styles.previewOliviaDock} /></div>
          ) : focusedPhoto ? <><div className={styles.previewCanvas} onDoubleClick={openFullscreenPreview}><button type="button" className={`${styles.previewArrow} ${styles.previewArrowLeft}`} onClick={() => moveFocus(-1)} disabled={focusedIndex <= 0} aria-label="이전 사진"><ChevronLeft size={22} /></button><BridgePreviewImage photo={focusedPhoto} onSize={setPreviewSize} /><button type="button" className={`${styles.previewArrow} ${styles.previewArrowRight}`} onClick={() => moveFocus(1)} disabled={focusedIndex < 0 || focusedIndex >= visibleJpgs.length - 1} aria-label="다음 사진"><ChevronRight size={22} /></button></div><div className={styles.previewMeta}><strong>{focusedPhoto.name}</strong><span>{previewSize ? `${previewSize.width} × ${previewSize.height}` : "크기 확인 중"}</span><i /><span>{formatBytes(focusedPhoto.size)}</span><i /><span>{focusedPhoto.extension}</span>{focusedPhoto.captureTimestamp ? <><i /><span title={focusedPhoto.timestampSource === "mtime" ? "EXIF 촬영시각이 없어 파일 수정시각을 사용했습니다." : "사진 EXIF 메타데이터의 촬영시각입니다."}>{formatBridgeTimestamp(focusedPhoto)}</span></> : null}<div className={styles.previewRatings} aria-label="별점">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${rating}점`} aria-pressed={(effectiveRatings[focusedPhoto.id] ?? 0) >= rating} onClick={() => applyRating(rating, true)}><Star size={15} fill={(effectiveRatings[focusedPhoto.id] ?? 0) >= rating ? "currentColor" : "none"} /></button>)}<button type="button" onClick={() => applyRating(0, true)}>해제</button></div><button type="button" className={styles.previewSelectButton} onClick={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(focusedPhoto.id)) next.delete(focusedPhoto.id); else next.add(focusedPhoto.id); return next; })}><Check size={13} />{selectedIds.has(focusedPhoto.id) ? "선택됨" : "선택"}</button><button type="button" className={styles.previewExpandButton} onClick={openFullscreenPreview}><Maximize2 size={13} /> 크게 보기</button></div></> : focusedPlainFile ? <div className={styles.previewFileInfo}><File size={42} /><strong>{focusedPlainFile.name}</strong><span>{focusedPlainFile.extension} · {formatBytes(focusedPlainFile.size)}</span><p>RAW와 사이드카는 파일 정보만 표시하며 미리보기를 만들지 않습니다.</p></div> : <div className={styles.previewEmpty}><Images size={34} /><strong>미리 볼 파일을 선택해 주세요</strong><span>RAW와 사이드카는 미리보기를 만들지 않습니다.</span></div>}
        </aside>
      </main>

      <section className={styles.actionBar} aria-label="Bridge 작업 도구">
        <div className={styles.actionSummary}><span>선택 <b>{selectedIds.size}</b></span><span>레이블 <b>{labeledCount}</b></span><span>제외 <b>{excludedIds.size}</b></span></div>
        <nav className={styles.actionTools}>
          {TOOL_ITEMS.map(({ key, label, icon: Icon }) => {
            const disabledReason = toolDisabledReason(key);
            return <button key={key} type="button" data-primary={key === "classification" ? "true" : "false"} data-active={toolKey === key || (key === "classification" && sceneReviewOpen) ? "true" : "false"} onClick={() => openTool(key)} disabled={Boolean(disabledReason)} aria-label={disabledReason ? `${label}: ${disabledReason}` : label} title={disabledReason ?? label}><Icon size={12} strokeWidth={1.8} /><span>{label}</span>{disabledReason ? <small>{disabledReason}</small> : null}</button>;
          })}
          <button type="button" className={styles.customerSelectionButton} onClick={openGallerySelectImport} disabled={!hasActiveFolder || scanStatus !== "ready"} aria-label={!hasActiveFolder || scanStatus !== "ready" ? "갤러리 고객 셀렉: 사진 폴더를 먼저 선택해 주세요." : "갤러리 고객 셀렉 불러오기"} title={!hasActiveFolder || scanStatus !== "ready" ? "사진 폴더를 먼저 선택해 주세요." : "사진선택 갤러리에 제출된 고객 셀렉을 비교합니다."}><Users size={12} strokeWidth={1.8} /><span>갤러리 고객 셀렉</span></button>
          <button type="button" className={styles.customerSelectionButton} onClick={openPersonSelectImport} disabled={!hasActiveFolder || scanStatus !== "ready"} aria-label={!hasActiveFolder || scanStatus !== "ready" ? "고객 선택 불러오기: 사진 폴더를 먼저 선택해 주세요." : "개인별 사진선택 행사 불러오기"} title={!hasActiveFolder || scanStatus !== "ready" ? "사진 폴더를 먼저 선택해 주세요." : "개인별 사진 셀렉 행사에서 고객이 고른 사진을 불러옵니다."}><Users size={12} strokeWidth={1.8} /><span>고객 선택 불러오기</span></button>
        </nav>
      </section>

      <footer className={styles.shortcutBar}>
        <div className={styles.shortcutHints}>{activeRatingFilterName ? <b className={styles.shortcutActiveFilter}>{activeRatingFilterName}</b> : null}{activeColorFilterName ? <b className={styles.shortcutActiveFilter}>{activeColorFilterName}</b> : null}<span>드래그 영역 선택</span><span>⌘/Ctrl 클릭 추가 선택</span><span>Shift+←↑↓→ 범위 선택</span><span>⌘/Ctrl+A 전체 선택</span><span>⌘/Ctrl+B 선택 리뷰</span><span>← ↑ ↓ → 사진 이동</span><span>Space OS 창 미리보기</span><span>1–5 별점 · 0 해제</span><span>6–9 컬러 · 같은 키 해제</span><span>⌥⌘숫자 필터 · ⌥⌘A 전체 · ⌘F 검색</span><span>X 제외</span>{scan.unreadableFolderCount ? <i>하위 폴더 {scan.unreadableFolderCount}곳을 읽지 못함</i> : null}{scan.ignoredCount ? <i>숨김·기타 {scan.ignoredCount}개 제외</i> : null}</div>
      </footer>

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
        <div className={styles.sceneBody}>
          {sceneState.status === "running" ? <div className={styles.sceneProgress}><span style={{ width: `${sceneState.total ? Math.min(100, sceneState.completed / sceneState.total * 100) : 4}%` }} /></div> : null}
          {sceneState.error ? <div className={styles.sceneError}><CircleAlert size={17} /><span>{sceneState.error}</span><button type="button" onClick={() => setSceneRunKey((value) => value + 1)}><RefreshCw size={14} /> 다시 시도</button></div> : null}
          <section className={styles.departmentContext} aria-label="사진 분류 진료과">
            {departmentLoading ? <div className={styles.departmentStatus}><LoaderCircle className={styles.spin} size={14} /><span>등록 고객과 폴더에서 진료과 확인 중...</span></div> : null}
            {!departmentLoading && photoDepartmentResolution.status === "resolved" && !departmentPickerOpen ? (
              <div className={styles.departmentStatus}>
                <Check size={14} />
                <span><strong>{DEPARTMENT_DISPLAY[photoDepartmentResolution.department]} 적용됨</strong> · {PHOTO_DEPARTMENT_SOURCE_DISPLAY[photoDepartmentResolution.source]}</span>
                {photoDepartmentResolution.department === "orthopedics_neurosurgery" && photoDepartmentResolution.rawValue !== "orthopedics_neurosurgery" ? <small>{photoDepartmentResolution.rawValue} → 근골격·통증계 규칙</small> : null}
                <button type="button" onClick={() => setDepartmentPickerOpen(true)}>변경</button>
              </div>
            ) : null}
            {!departmentLoading && (departmentPickerOpen || photoDepartmentResolution.status !== "resolved") ? (
              <div className={styles.departmentPicker}>
                <span>{departmentError || (photoDepartmentResolution.status === "conflict" ? "등록 고객과 폴더명의 진료과가 다릅니다. 적용할 진료과를 확인해 주세요." : "등록 고객과 폴더명에서 진료과를 찾지 못했습니다.")}</span>
                <label>
                  <span>진료과</span>
                  <select
                    aria-label="사진 분류 진료과 선택"
                    value={photoDepartmentResolution.status === "resolved" ? photoDepartmentResolution.department : ""}
                    onChange={(event) => event.target.value && chooseDepartment(event.target.value as MedicalDepartment)}
                  >
                    <option value="">진료과를 선택해 주세요</option>
                    {(Object.entries(DEPARTMENT_DISPLAY) as Array<[MedicalDepartment, string]>).map(([value, label]) => (
                      <option key={value} value={value}>{label}{DEPARTMENT_DESCRIPTION[value] ? ` (${DEPARTMENT_DESCRIPTION[value]})` : ""}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </section>
          <div className={styles.sceneGrid}>{selectedScenes.map((scene) => { const photo = scenePhotoByName.get(scene.representativeFileName); return <article key={scene.id}>{photo ? <BridgeThumbnail photo={photo} alt={`${scene.label} 대표 사진`} eager /> : null}<div><strong>{scene.label}</strong><span>{scene.fileCount}장</span></div><small>{scene.firstFileName} – {scene.lastFileName}</small>{scene.needsReview ? <i>경계 확인 필요</i> : null}</article>; })}{sceneState.status === "complete" && !selectedScenes.length ? <p>Olivia 또는 Adobe Bridge에서 분류할 JPG를 선택해 주세요.</p> : null}</div>
        </div>
        <footer><div className={styles.sceneApprovalSummary}><strong>Scene {selectedScenes.length.toLocaleString("ko-KR")}개 · 선택 JPG {(selectedSceneAnalysis?.files.length ?? 0).toLocaleString("ko-KR")}장 · 경계 확인 {sceneBoundaryReviewCount.toLocaleString("ko-KR")}곳</strong><p>{adobeSelectionLoading ? "Adobe Bridge의 XMP 별점을 확인하고 있습니다." : scenePlanReady ? "Olivia와 Adobe Bridge 선택만 적용합니다. 파일은 아직 이동하지 않습니다." : selectedSceneAnalysisReady && photoDepartmentResolution.status !== "resolved" ? "진료과를 확인해야 Scene 계획을 적용할 수 있습니다." : sceneState.status === "complete" ? "Olivia 또는 Adobe Bridge에서 분류할 JPG를 선택해 주세요." : "분석이 끝나면 Scene 계획을 적용할 수 있습니다."}</p></div><button type="button" disabled={!scenePlanReady} onClick={applyScenePlan}><ScanSearch size={16} /> 계획 적용하고 Scene 검토</button></footer>
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

      {folderSourceOpen ? (
        <div className={styles.folderSourceOverlay} onClick={() => setFolderSourceOpen(false)}>
          <section className={styles.folderSourceChooser} role="dialog" aria-modal="true" aria-labelledby="bridge-folder-source-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><strong id="bridge-folder-source-title">폴더 선택</strong><span>사진이 있는 위치를 선택해 주세요.</span></div>
              <button type="button" onClick={() => setFolderSourceOpen(false)} aria-label="폴더 선택 닫기"><X size={18} /></button>
            </header>
            <div>
              <button type="button" onClick={pickLocalFolder}><Monitor size={19} /><span><strong>이 Mac의 폴더</strong><small>현재 기기에 있는 폴더를 엽니다.</small></span></button>
              <button type="button" onClick={pickNasFolder}><HardDrive size={19} /><span><strong>NAS 폴더</strong><small>Mac Studio에서 NAS 폴더를 엽니다.</small></span></button>
            </div>
          </section>
        </div>
      ) : null}

      {gallerySelectDialogOpen ? (
        <div className={`${styles.folderSourceOverlay} ${styles.customerSelectionOverlay}`} onClick={closeGallerySelectImport}>
          <section className={`${styles.folderSourceChooser} ${styles.customerSelectionChooser}`} role="dialog" aria-modal="true" aria-labelledby="bridge-gallery-select-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><strong id="bridge-gallery-select-title">갤러리 고객 셀렉 비교</strong><span>현재 폴더와 연결할 갤러리를 직접 선택합니다. 내 셀렉과 고객 셀렉은 서로 바뀌지 않습니다.</span></div>
              <button type="button" onClick={closeGallerySelectImport} aria-label="갤러리 고객 셀렉 닫기"><X size={18} /></button>
            </header>
            <div className={styles.customerSelectionBody}>
              {galleryCustomerResult ? (
                <section className={styles.customerSelectionResult} aria-live="polite">
                  <strong>{galleryCustomerResult.gallery.title}</strong>
                  <p>고객 선택 {galleryCustomerResult.total.toLocaleString("ko-KR")}장 중 현재 폴더에서 {galleryCustomerResult.match.matchedBridgeIds.size.toLocaleString("ko-KR")}장을 정확히 찾았습니다. · 누락 {galleryCustomerResult.match.missing.length.toLocaleString("ko-KR")}장 · 중복 확인 {galleryCustomerResult.match.ambiguous.length.toLocaleString("ko-KR")}장</p>
                  {galleryCustomerResult.match.missing.length ? <div><span>못 찾은 파일</span><ul>{galleryCustomerResult.match.missing.map((item) => <li key={item.imageId}>{item.relativePath || item.fileName}</li>)}</ul></div> : null}
                  {galleryCustomerResult.match.ambiguous.length ? <div><span>동명 파일이라 확인이 필요한 항목</span><ul>{galleryCustomerResult.match.ambiguous.map((item) => <li key={item.imageId}>{item.relativePath || item.fileName} · 후보 {item.candidateIds.length}개</li>)}</ul></div> : null}
                  {!galleryCustomerResult.match.missing.length && !galleryCustomerResult.match.ambiguous.length ? <small>모든 고객 선택 사진을 정확히 찾았습니다.</small> : <small>누락 또는 중복 파일은 자동 선택하지 않았습니다.</small>}
                  <div className={styles.customerSelectionResultActions}>
                    <button type="button" disabled={!galleryCustomerResult.match.matchedBridgeIds.size} onClick={addCustomerSelectionToAdminSelection}>찾은 사진을 내 셀렉에 추가</button>
                    <button type="button" onClick={() => { setGalleryCustomerResult(null); setComparisonFilter("all"); }}>다른 갤러리 고르기</button>
                  </div>
                </section>
              ) : selectGalleriesLoading ? (
                <div className={styles.customerSelectionState}><LoaderCircle className={styles.spin} size={17} />갤러리 목록을 불러오는 중입니다.</div>
              ) : gallerySelectError ? (
                <div className={styles.customerSelectionState} role="alert"><CircleAlert size={17} />{gallerySelectError}<button type="button" onClick={() => void loadSelectGalleries()}>다시 불러오기</button></div>
              ) : selectGalleries.length || sharedSelectProjects.length ? (
                <div className={styles.customerSelectionSources}>
                  {selectGalleries.length ? <section><strong>셀렉 갤러리</strong><div className={styles.customerSelectionEvents}>{selectGalleries.map((gallery) => <button key={gallery.id} type="button" disabled={Boolean(gallerySelectImportingId) || !gallery.submitted_at} onClick={() => void importGalleryCustomerSelection(gallery)}><Images size={17} /><span><strong>{gallery.title}</strong><small>{gallery.hospital_name || gallery.shooting_name || "고객 미연결"} · {gallery.submitted_at ? `고객 제출 ${Number(gallery.selected_count ?? 0).toLocaleString("ko-KR")}장` : "제출 전"}{gallery.bridge_folder_display_path ? ` · 연결 ${gallery.bridge_folder_display_path}` : ""}</small></span>{gallerySelectImportingId === gallery.id ? <LoaderCircle className={styles.spin} size={16} /> : <ChevronRight size={16} />}</button>)}</div></section> : null}
                  {sharedSelectProjects.length ? <section><strong>공유 사진선택 프로젝트</strong><div className={styles.customerSelectionEvents}>{sharedSelectProjects.map((project) => <button key={project.id} type="button" disabled={Boolean(gallerySelectImportingId) || !project.shared_submitted_at} onClick={() => void importSharedProjectSelection(project)}><Users size={17} /><span><strong>{project.title}</strong><small>{project.shared_submitted_at ? "공동 셀렉 제출 완료" : "제출 전"}</small></span>{gallerySelectImportingId === project.id ? <LoaderCircle className={styles.spin} size={16} /> : <ChevronRight size={16} />}</button>)}</div></section> : null}
                </div>
              ) : <div className={styles.customerSelectionState}>등록된 사진선택 갤러리나 공유 프로젝트가 없습니다.</div>}
            </div>
          </section>
        </div>
      ) : null}

      {personSelectDialogOpen ? (
        <div className={`${styles.folderSourceOverlay} ${styles.customerSelectionOverlay}`} onClick={closePersonSelectImport}>
          <section className={`${styles.folderSourceChooser} ${styles.customerSelectionChooser}`} role="dialog" aria-modal="true" aria-labelledby="bridge-person-select-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><strong id="bridge-person-select-title">개인별 사진선택 행사 불러오기</strong><span>개인별 사진 셀렉 행사를 고르면 현재 폴더에서 같은 파일명을 찾습니다.</span></div>
              <button type="button" onClick={closePersonSelectImport} aria-label="개인별 사진선택 행사 닫기"><X size={18} /></button>
            </header>
            <div className={styles.customerSelectionBody}>
              {personSelectResult ? (
                <section className={styles.customerSelectionResult} aria-live="polite">
                  <strong>{personSelectResult.eventTitle}</strong>
                  <p>고객 선택 {personSelectResult.total.toLocaleString("ko-KR")}장 중 지금 폴더에서 {personSelectResult.found.toLocaleString("ko-KR")}장을 찾았습니다. ({personSelectResult.missing.length.toLocaleString("ko-KR")}장 못 찾음)</p>
                  {personSelectResult.missing.length ? <div><span>못 찾은 파일</span><ul>{personSelectResult.missing.map((name) => <li key={name}>{name}</li>)}</ul></div> : <small>모든 고객 선택 사진을 찾았습니다.</small>}
                  <button type="button" onClick={() => setPersonSelectResult(null)}>다른 행사 고르기</button>
                </section>
              ) : personSelectEventsLoading ? (
                <div className={styles.customerSelectionState}><LoaderCircle className={styles.spin} size={17} />행사 목록을 불러오는 중입니다.</div>
              ) : personSelectError ? (
                <div className={styles.customerSelectionState} role="alert"><CircleAlert size={17} />{personSelectError}<button type="button" onClick={() => void loadPersonSelectEvents()}>다시 불러오기</button></div>
              ) : personSelectEvents.length ? (
                <div className={styles.customerSelectionEvents}>{personSelectEvents.map((event) => <button key={event.id} type="button" disabled={Boolean(personSelectImportingId)} onClick={() => void importPersonSelectEvent(event)}><Users size={17} /><span><strong>{event.title}</strong><small>인원 {event.people_count.toLocaleString("ko-KR")}명 · 제출 {event.submitted_count.toLocaleString("ko-KR")}명</small></span>{personSelectImportingId === event.id ? <LoaderCircle className={styles.spin} size={16} /> : <ChevronRight size={16} />}</button>)}</div>
              ) : <div className={styles.customerSelectionState}>등록된 개인별 사진 셀렉 행사가 없습니다.</div>}
            </div>
          </section>
        </div>
      ) : null}

      {rawRootPromptOpen ? (
        <div className={styles.folderSourceOverlay} onClick={() => setRawRootPromptOpen(false)}>
          <section className={styles.folderSourceChooser} role="dialog" aria-modal="true" aria-labelledby="bridge-raw-root-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><strong id="bridge-raw-root-title">RAW 파일을 어디서 찾을까요?</strong><span>촬영 폴더 전체 또는 지금 폴더만 선택할 수 있습니다.</span></div>
              <button type="button" onClick={() => setRawRootPromptOpen(false)} aria-label="RAW 검색 기준 폴더 닫기"><X size={18} /></button>
            </header>
            {rawRootPromptError ? <p className={styles.rawRootPromptAlert} role="alert">{rawRootPromptError}</p> : null}
            <div>
              <button type="button" onClick={() => void pickRawSearchRoot()}><FolderOpen size={19} /><span><strong>촬영 폴더 전체에서 찾기</strong><small>JPG와 RAW 폴더가 함께 들어 있는 촬영 폴더를 한 번 골라 주세요.</small></span></button>
              <button type="button" onClick={openRawMatchWithCurrentScope}><ScanSearch size={19} /><span><strong>지금 폴더에서만 찾기</strong><small>RAW와 JPG가 같은 폴더에 있을 때 선택하세요.</small></span></button>
            </div>
          </section>
        </div>
      ) : null}

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
