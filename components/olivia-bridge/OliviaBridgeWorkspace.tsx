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
  FolderPlus,
  HardDrive,
  Images,
  LayoutGrid,
  Link2,
  LoaderCircle,
  Maximize2,
  Minus,
  Monitor,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  Scaling,
  ScanSearch,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Star,
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
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { BridgeFloatingWindow } from "@/components/olivia-bridge/BridgeFloatingWindow";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import {
  analyzeBridgeScenes,
  rebuildBridgeSceneAnalysis,
  scanBridgeFolder,
  updateBridgeSelection,
  type BridgeFolderScan,
  type BridgeJpgFile,
  type BridgeRawFile,
  type BridgeScene,
  type BridgeSceneAnalysis,
} from "@/lib/photo-bridge/bridgeFiles";
import { createBridgeClassificationPlan } from "@/lib/photo-bridge/classificationPlan";
import { collectAdobeBridgeRatings } from "@/lib/selectMatch/bridgeRating";
import { fetchPhotoDepartmentContext } from "@/lib/photo-classifier/departmentContextClient";
import {
  manualPhotoDepartmentResolution,
  PHOTO_DEPARTMENT_SOURCE_DISPLAY,
} from "@/lib/photo-classifier/departmentResolver";
import { DEPARTMENT_DESCRIPTION, DEPARTMENT_DISPLAY, type MedicalDepartment } from "@/lib/photo-classifier/types";
import type { BridgeFloatingWindowRect } from "@/lib/photo-bridge/floatingWindow";
import { REMOTE_NAS_ROOT_NAME, type RemoteNasSelection } from "@/lib/remote-nas/types";
import { normalizeRemoteNasRelativePath, toRemoteNasDisplayPath } from "@/lib/remote-nas/path";
import { loadRemoteBridgeThumbnails } from "@/lib/photo-bridge/remoteThumbnails";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import {
  bridgeGridNavigationTarget,
  type BridgeGridDirection,
} from "@/lib/photo-bridge/gridNavigation";
import { mergePhotoToolSelectionSources, normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";
import {
  BRIDGE_PANE_DEFAULT_WIDTH,
  bridgePaneWidthFromPointer,
  clampBridgePaneWidth,
  type BridgeResizablePane,
} from "@/lib/photo-bridge/paneLayout";
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
  saveBridgeFolderTrail,
} from "@/lib/photo-bridge/recentFolder";
import {
  BRIDGE_COLOR_LABELS,
  bridgeLabelFilterCommandFromShortcutCode,
  bridgeLabelFilterName,
  matchesBridgeSelectionView,
  matchesBridgeLabelFilter,
  normalizeBridgeColorLabels,
  toggleBridgeColorLabel,
  updateBridgeRatings,
  type BridgeColorLabel,
  type BridgeColorLabels,
  type BridgeLabelFilter,
  type BridgeLabelFilterCommand,
  type BridgeSelectionView,
} from "@/lib/photo-bridge/labels";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { useDesktopWindowMode, useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import type { PhotoFileOpsMode, PhotoSelectMode, PhotoWorkspaceMode } from "@/components/photo-workspace/types";
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
type PreviewTab = "preview" | "olivia";
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
  { key: "classification", label: "사진 분류", icon: ScanSearch, mode: "classification" },
  { key: "tcut", label: "T컷 정리", icon: Scissors, mode: "select", selectMode: "tcut" },
  { key: "resize", label: "사진 리사이즈", icon: Scaling, mode: "file-ops", fileOpsMode: "resize" },
  { key: "rename", label: "이름변경", icon: PencilLine, mode: "file-ops", fileOpsMode: "rename" },
  { key: "retouch", label: "사진 보정", icon: WandSparkles, mode: "retouch" },
];

const thumbnailCache = new Map<string, Promise<string>>();

async function createThumbnailUrl(photo: BridgeJpgFile) {
  const cached = thumbnailCache.get(photo.id);
  if (cached) return cached;
  const task = (async () => {
    if (!photo.file) {
      if (!photo.thumbnailUrl) throw new Error(`${photo.name} 썸네일 주소가 없습니다.`);
      return photo.thumbnailUrl;
    }
    try {
      const bitmap = await createImageBitmap(photo.file, { imageOrientation: "from-image" });
      const max = 420;
      const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("썸네일 생성 실패")),
        "image/jpeg",
        0.76,
      ));
      return URL.createObjectURL(blob);
    } catch {
      return URL.createObjectURL(photo.file);
    }
  })();
  thumbnailCache.set(photo.id, task);
  return task;
}

function BridgeThumbnail({ photo, alt = "", eager = false }: { photo: BridgeJpgFile; alt?: string; eager?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    const load = () => void createThumbnailUrl(photo).then((next) => { if (active) setUrl(next); });
    if (eager || !hostRef.current || typeof IntersectionObserver === "undefined") load();
    else {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      }, { rootMargin: "500px" });
      observer.observe(hostRef.current);
      return () => { active = false; observer.disconnect(); };
    }
    return () => { active = false; };
  }, [eager, photo]);

  return <div ref={hostRef} className={styles.thumbnailMedia}>{url ? <img src={url} alt={alt} draggable={false} decoding="async" /> : <LoaderCircle className={styles.spin} size={18} aria-label="썸네일 불러오는 중" />}</div>;
}

function BridgePreviewImage({ photo, onSize }: { photo: BridgeJpgFile; onSize?: (size: { width: number; height: number }) => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!photo.file) {
      setUrl(photo.thumbnailUrl);
      return;
    }
    const next = URL.createObjectURL(photo.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);
  return url ? (
    <img src={url} alt={photo.name} draggable={false} decoding="async" onLoad={onSize ? (event) => onSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }) : undefined} />
  ) : <LoaderCircle className={styles.spin} size={24} />;
}

function BridgeFullscreenPreview({
  photo,
  position,
  total,
  rating,
  colorLabel,
  canMovePrevious,
  canMoveNext,
  onMove,
  onClose,
}: {
  photo: BridgeJpgFile;
  position: number;
  total: number;
  rating: number;
  colorLabel?: BridgeColorLabel;
  canMovePrevious: boolean;
  canMoveNext: boolean;
  onMove: (delta: number) => void;
  onClose: () => void;
}) {
  const color = colorLabel ? BRIDGE_COLOR_LABELS[colorLabel] : null;
  return (
    <section className={styles.fullscreenPreview} role="dialog" aria-modal="true" aria-label="사진 전체화면 미리보기">
      <BridgePreviewImage photo={photo} />
      <button type="button" className={styles.fullscreenClose} onClick={onClose} aria-label="전체화면 닫기">
        <X size={25} strokeWidth={1.8} />
      </button>
      <button type="button" className={`${styles.fullscreenArrow} ${styles.fullscreenArrowLeft}`} onClick={() => onMove(-1)} disabled={!canMovePrevious} aria-label="이전 사진">
        <ChevronLeft size={30} strokeWidth={1.6} />
      </button>
      <button type="button" className={`${styles.fullscreenArrow} ${styles.fullscreenArrowRight}`} onClick={() => onMove(1)} disabled={!canMoveNext} aria-label="다음 사진">
        <ChevronRight size={30} strokeWidth={1.6} />
      </button>
      <div className={styles.fullscreenLabelBar}>
        <div><strong>{photo.name}</strong><span>{position.toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")}</span></div>
        <div className={styles.fullscreenActiveLabels}>
          {rating ? <span className={styles.fullscreenRating}><Star size={13} fill="currentColor" /> {rating}</span> : null}
          {color ? <span><i style={{ background: color.color }} />{color.name}</span> : null}
          {!rating && !color ? <small>레이블 없음</small> : null}
        </div>
        <p>1–5 별점 · 0 해제 · 6–9 컬러 · ⌥⌘ 숫자만 보기 · ⌥⌘A 전체</p>
      </div>
    </section>
  );
}

function PlainFileCard({ file, active, onClick }: { file: BridgeRawFile; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={styles.plainFileCard} data-active={active} onClick={onClick}>
      <File size={30} strokeWidth={1.5} aria-hidden="true" />
      <span>{file.extension}</span>
      <strong title={file.name}>{file.name}</strong>
      <small>{formatBytes(file.size)}</small>
    </button>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

function isSpaceShortcutTarget(target: EventTarget | null, root: HTMLDivElement) {
  return target === root || (target instanceof HTMLElement && Boolean(target.closest("[data-bridge-photo-id]")));
}

const BRIDGE_PANE_STORAGE_KEY = "olivia-bridge:pane-widths";

function readStoredPaneWidth(pane: BridgeResizablePane) {
  try {
    const stored = JSON.parse(localStorage.getItem(BRIDGE_PANE_STORAGE_KEY) ?? "{}") as Partial<Record<BridgeResizablePane, number>>;
    return typeof stored[pane] === "number" ? stored[pane] : BRIDGE_PANE_DEFAULT_WIDTH[pane];
  } catch {
    return BRIDGE_PANE_DEFAULT_WIDTH[pane];
  }
}

function storePaneWidth(pane: BridgeResizablePane, width: number) {
  try {
    const stored = JSON.parse(localStorage.getItem(BRIDGE_PANE_STORAGE_KEY) ?? "{}") as Partial<Record<BridgeResizablePane, number>>;
    localStorage.setItem(BRIDGE_PANE_STORAGE_KEY, JSON.stringify({ ...stored, [pane]: width }));
  } catch (error) {
    void error;
  }
}

function BridgePaneDivider({
  pane,
  workspaceRef,
  oppositePaneRef,
  controls,
  label,
}: {
  pane: BridgeResizablePane;
  workspaceRef: RefObject<HTMLElement | null>;
  oppositePaneRef: RefObject<HTMLElement | null>;
  controls: string;
  label: string;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const widthRef = useRef(BRIDGE_PANE_DEFAULT_WIDTH[pane]);
  const scheduledWidthRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [width, setWidth] = useState(BRIDGE_PANE_DEFAULT_WIDTH[pane]);
  const [dragging, setDragging] = useState(false);

  const applyWidth = useCallback((requestedWidth: number) => {
    const workspace = workspaceRef.current;
    if (!workspace) return widthRef.current;
    const nextWidth = clampBridgePaneWidth({
      pane,
      requestedWidth,
      containerWidth: workspace.getBoundingClientRect().width,
      oppositePaneWidth: oppositePaneRef.current?.getBoundingClientRect().width ?? BRIDGE_PANE_DEFAULT_WIDTH[pane === "folder" ? "preview" : "folder"],
    });
    workspace.style.setProperty(pane === "folder" ? "--bridge-folder-width" : "--bridge-preview-width", `${nextWidth}px`);
    widthRef.current = nextWidth;
    setWidth(nextWidth);
    return nextWidth;
  }, [oppositePaneRef, pane, workspaceRef]);

  const flushScheduledWidth = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    const requestedWidth = scheduledWidthRef.current;
    scheduledWidthRef.current = null;
    return requestedWidth === null ? widthRef.current : applyWidth(requestedWidth);
  }, [applyWidth]);

  const scheduleWidth = useCallback((requestedWidth: number) => {
    scheduledWidthRef.current = requestedWidth;
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const nextWidth = scheduledWidthRef.current;
      scheduledWidthRef.current = null;
      if (nextWidth !== null) applyWidth(nextWidth);
    });
  }, [applyWidth]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const frame = requestAnimationFrame(() => applyWidth(readStoredPaneWidth(pane)));
    const observer = new ResizeObserver(() => {
      if (workspace.getBoundingClientRect().width <= 760) return;
      applyWidth(widthRef.current);
    });
    observer.observe(workspace);
    return () => {
      cancelAnimationFrame(frame);
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      observer.disconnect();
    };
  }, [applyWidth, pane, workspaceRef]);

  const widthFromPointer = useCallback((clientX: number) => {
    const workspace = workspaceRef.current;
    if (!workspace) return widthRef.current;
    const bounds = workspace.getBoundingClientRect();
    return bridgePaneWidthFromPointer({
      pane,
      pointerX: clientX,
      containerLeft: bounds.left,
      containerRight: bounds.right,
    });
  }, [pane, workspaceRef]);

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const finalWidth = flushScheduledWidth();
    pointerIdRef.current = null;
    setDragging(false);
    storePaneWidth(pane, finalWidth);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [flushScheduledWidth, pane]);

  return (
    <div
      className={`${styles.paneDivider} ${dragging ? styles.paneDividerDragging : ""}`}
      role="separator"
      aria-label={label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={pane === "folder" ? 150 : 240}
      aria-valuemax={pane === "folder" ? 360 : 560}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        pointerIdRef.current = event.pointerId;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        scheduleWidth(widthFromPointer(event.clientX));
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current !== event.pointerId) return;
        scheduleWidth(widthFromPointer(event.clientX));
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onDoubleClick={() => {
        const nextWidth = applyWidth(BRIDGE_PANE_DEFAULT_WIDTH[pane]);
        storePaneWidth(pane, nextWidth);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const delta = pane === "folder" ? direction * 24 : direction * -24;
        const nextWidth = applyWidth(widthRef.current + delta);
        storePaneWidth(pane, nextWidth);
      }}
    />
  );
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
    setExecutionMode,
    stageBridgeClassificationPlan,
    photoDepartmentResolution,
    setPhotoDepartmentResolution,
  } = usePhotoStudioExecution();
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [remoteFolder, setRemoteFolder] = useState<RemoteNasSelection | null>(null);
  const [scan, setScan] = useState<BridgeFolderScan>(EMPTY_SCAN);
  const [scanStatus, setScanStatus] = useState<"idle" | "restoring" | "loading" | "ready" | "error">("restoring");
  const [scanError, setScanError] = useState<string>();
  const [includeNestedJpgs, setIncludeNestedJpgs] = useState(false);
  const [restoreTrail, setRestoreTrail] = useState<Breadcrumb[]>([]);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [selectedIds, setSelectedIdsState] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const manualSelectedIdsRef = useRef<Set<string>>(new Set());
  const adobeSelectedIdsRef = useRef<Set<string>>(new Set());
  const adobeSelectionGenerationRef = useRef(0);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [toolKey, setToolKey] = useState<ToolKey>();
  const [sceneReviewOpen, setSceneReviewOpen] = useState(false);
  const [thumbnailSize, setThumbnailSize] = useState(THUMBNAIL_SIZE_DEFAULT);
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [labelFilter, setLabelFilter] = useState<BridgeLabelFilter | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [adobeRatings, setAdobeRatings] = useState<Record<string, number>>({});
  const [adobeSelectionLoading, setAdobeSelectionLoading] = useState(false);
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
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("preview");
  const [compactPreviewOpen, setCompactPreviewOpen] = useState(false);
  const [focusedPlainId, setFocusedPlainId] = useState<string | null>(null);
  const floatingWindowRectsRef = useRef<Record<string, BridgeFloatingWindowRect>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const folderPanelRef = useRef<HTMLElement>(null);
  const previewPanelRef = useRef<HTMLElement>(null);
  const fileAreaRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeSessionRef = useRef<MarqueeSession | null>(null);
  const marqueeFrameRef = useRef<number | null>(null);
  const suppressThumbnailClickRef = useRef(false);
  const restoreAttemptedRef = useRef(false);
  const remoteLoadGenerationRef = useRef(0);

  const activeFolder = breadcrumbs.at(-1)?.handle ?? null;
  const folderPath = remoteFolder?.path ?? breadcrumbs.map((item) => item.name).join(" / ");
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
  const effectiveRatings = useMemo(() => ({ ...ratings, ...adobeRatings }), [adobeRatings, ratings]);
  const selectedNames = useMemo(() => scan.jpgs.filter((photo) => selectedIds.has(photo.id)).map((photo) => photo.name), [scan.jpgs, selectedIds]);
  const visibleJpgs = useMemo(() => scan.jpgs.filter((photo) => {
    if (labelFilter) return matchesBridgeLabelFilter(photo.id, labelFilter, effectiveRatings, colorLabels);
    if (fileFilter === "raw" || fileFilter === "sidecar") return false;
    if (fileFilter === "starred" || fileFilter === "colored" || fileFilter === "selected" || fileFilter === "unselected") {
      return matchesBridgeSelectionView(photo.id, fileFilter, effectiveRatings, colorLabels);
    }
    if (fileFilter === "excluded") return excludedIds.has(photo.id);
    return true;
  }), [colorLabels, effectiveRatings, excludedIds, fileFilter, labelFilter, scan.jpgs]);
  const showRaws = !labelFilter && (fileFilter === "all" || fileFilter === "raw");
  const showSidecars = !labelFilter && (fileFilter === "all" || fileFilter === "sidecar");
  const focusedIndex = useMemo(() => visibleJpgs.findIndex((photo) => photo.id === focusedId), [focusedId, visibleJpgs]);
  const focusedPhoto = visibleJpgs.find((photo) => photo.id === focusedId) ?? null;
  const visiblePlainFiles = useMemo(() => [
    ...(showRaws ? scan.raws : []),
    ...(showSidecars ? scan.sidecars : []),
  ], [scan.raws, scan.sidecars, showRaws, showSidecars]);
  const focusedPlainFile = visiblePlainFiles.find((file) => file.id === focusedPlainId) ?? null;
  const activeTool = TOOL_ITEMS.find((item) => item.key === toolKey);

  const commitSelectedIds = useCallback((manual: ReadonlySet<string>, adobe: ReadonlySet<string>) => {
    const nextManual = new Set(manual);
    const nextAdobe = new Set(adobe);
    const next = mergePhotoToolSelectionSources(nextManual, nextAdobe);
    manualSelectedIdsRef.current = nextManual;
    adobeSelectedIdsRef.current = nextAdobe;
    selectedIdsRef.current = next;
    setSelectedIdsState(next);
    setSelectedJpgNames(scan.jpgs.filter((photo) => next.has(photo.id)).map((photo) => photo.name));
  }, [scan.jpgs, setSelectedJpgNames]);

  const setSelectedIds = useCallback((value: Set<string> | ((current: Set<string>) => Set<string>)) => {
    const requested = typeof value === "function" ? value(selectedIdsRef.current) : value;
    const manual = new Set([...requested].filter((id) => !adobeSelectedIdsRef.current.has(id)));
    commitSelectedIds(manual, adobeSelectedIdsRef.current);
  }, [commitSelectedIds]);

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
    const selectedKeys = new Set(selectedJpgNames.map(normalizePhotoToolFileKey).filter(Boolean));
    const next = new Set(scan.jpgs.filter((photo) => selectedKeys.has(normalizePhotoToolFileKey(photo.name))).map((photo) => photo.id));
    if (selectedIdsRef.current.size === next.size && [...selectedIdsRef.current].every((id) => next.has(id))) return;
    const manual = new Set([...next].filter((id) => !adobeSelectedIdsRef.current.has(id)));
    commitSelectedIds(manual, adobeSelectedIdsRef.current);
  }, [commitSelectedIds, scan.jpgs, selectedJpgNames]);

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const photo of scan.jpgs) {
      const rating = jpgRatingsByName[normalizePhotoToolFileKey(photo.name)];
      if (rating) next[photo.id] = rating;
    }
    setRatings((current) => {
      const currentEntries = Object.entries(current);
      const nextEntries = Object.entries(next);
      if (currentEntries.length === nextEntries.length && currentEntries.every(([id, rating]) => next[id] === rating)) return current;
      return next;
    });
  }, [jpgRatingsByName, scan.jpgs]);

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
      localStorage.setItem(`olivia-bridge:marks:${folderPath}`, JSON.stringify({ ratings, colorLabels, excluded: [...excludedIds] }));
    } catch (error) {
      void error;
    }
  }, [colorLabels, excludedIds, folderPath, ratings]);

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
      const next = await scanBridgeFolder(directory, nextPath, {
        includeNestedJpgs: nestedJpgs,
        maxDepth: 5,
      });
      let restoredRatings: Record<string, number> = {};
      try {
        const parsed = JSON.parse(localStorage.getItem(`olivia-bridge:marks:${nextPath}`) ?? "{}") as { ratings?: Record<string, number>; colorLabels?: unknown; excluded?: string[] };
        restoredRatings = parsed.ratings ?? {};
        setRatings(restoredRatings);
        setColorLabels(normalizeBridgeColorLabels(parsed.colorLabels));
        setExcludedIds(new Set(parsed.excluded ?? []));
      } catch {
        setRatings({});
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
      setAdobeRatings({});
      setSelectedIds(new Set());
      setAnchorId(null);
      setFocusedId(next.jpgs[0]?.id ?? null);
      setPreviewSize(undefined);
      setFileFilter("all");
      setCurrentLocalFolder(directory);
      setRawMatchDefaultFolder(bridgeRawMatchDefaultFolder(trail));
      setRawMatchFolderCandidates(bridgeRawMatchFolderCandidates(trail));
      const restoredRatingsByName = Object.fromEntries(next.jpgs.flatMap((photo) => {
        const rating = restoredRatings[photo.id];
        return rating ? [[photo.name, rating] as const] : [];
      }));
      setJpgRatingsByName(restoredRatingsByName, { overwrite: true });
      setScanStatus("ready");
      void saveBridgeFolderTrail(trail).catch((error) => {
        console.error("[olivia-bridge] Failed to remember the last folder", error);
      });
      rootRef.current?.focus();
    } catch (error) {
      setScanStatus("error");
      setScanError(error instanceof Error ? error.message : "폴더를 읽지 못했습니다.");
    }
  }, [includeNestedJpgs, setCurrentLocalFolder, setExecutionMode, setJpgRatingsByName, setRawMatchDefaultFolder, setRawMatchFolderCandidates, setSelectedIds]);

  const changeNestedJpgVisibility = useCallback((checked: boolean) => {
    setIncludeNestedJpgs(checked);
    if (!activeFolder || !breadcrumbs.length) return;
    void loadDirectory(activeFolder, breadcrumbs, checked);
  }, [activeFolder, breadcrumbs, loadDirectory]);

  const chooseFolder = useCallback(async () => {
    const directory = await picker.pick("readwrite");
    if (!directory) return;
    navigate?.("/olivia-bridge", "Olivia Bridge", {
      clientId,
      projectId: workflowRunId,
      workflowRunId,
    });
    await loadDirectory(directory, [{ name: directory.name, handle: directory }]);
  }, [clientId, loadDirectory, navigate, picker, workflowRunId]);

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

  const loadRemoteDirectory = useCallback(async (selection: RemoteNasSelection) => {
    const generation = ++remoteLoadGenerationRef.current;
    setScanStatus("loading");
    setScanError(undefined);
    setToolKey(undefined);
    setSceneReviewOpen(false);
    setRemoteFolder(selection);
    setScan(EMPTY_SCAN);
    setBreadcrumbs([]);
    setCurrentLocalFolder(null);
    setSelectedIds(new Set());
    setAnchorId(null);
    setFocusedId(null);
    setPreviewSize(undefined);
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
      }));
      setScan({ ...EMPTY_SCAN, jpgs });
      setFocusedId(jpgs[0]?.id ?? null);
      setScanStatus("ready");
      rootRef.current?.focus();
    } catch (error) {
      if (generation !== remoteLoadGenerationRef.current) return;
      setScanStatus("error");
      setScanError(error instanceof Error ? error.message : "원격 썸네일을 읽지 못했습니다.");
    }
  }, [setCurrentLocalFolder, setSelectedIds]);

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
    if (!activeFolder || !scan.jpgs.length) {
      setAdobeRatings({});
      commitSelectedIds(manualSelectedIdsRef.current, new Set());
      setAdobeSelectionLoading(false);
      return;
    }

    setAdobeSelectionLoading(true);
    try {
      const localPhotos = scan.jpgs
        .filter((photo): photo is BridgeJpgFile & { file: File } => Boolean(photo.file))
        .map((photo) => ({ name: photo.name, file: photo.file }));
      const found = await collectAdobeBridgeRatings(activeFolder, localPhotos, { signal });
      if (signal?.aborted || generation !== adobeSelectionGenerationRef.current) return;
      const nextRatings: Record<string, number> = {};
      const nextAdobeIds = new Set<string>();
      for (const photo of scan.jpgs) {
        const rating = found.get(normalizePhotoToolFileKey(photo.name));
        if (!rating) continue;
        nextRatings[photo.id] = rating;
        nextAdobeIds.add(photo.id);
      }
      setAdobeRatings(nextRatings);
      commitSelectedIds(manualSelectedIdsRef.current, nextAdobeIds);
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      console.error("[olivia-bridge] Failed to sync Adobe Bridge ratings", error);
    } finally {
      if (generation === adobeSelectionGenerationRef.current) setAdobeSelectionLoading(false);
    }
  }, [activeFolder, commitSelectedIds, scan.jpgs]);

  useEffect(() => {
    if (scanStatus !== "ready") return;
    const controller = new AbortController();
    void syncAdobeBridgeSelection(controller.signal);
    return () => controller.abort();
  }, [scanStatus, syncAdobeBridgeSelection]);

  useEffect(() => {
    if (scanStatus !== "ready") return;
    const refresh = () => { void syncAdobeBridgeSelection(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [scanStatus, syncAdobeBridgeSelection]);

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
    setAnchorId(photo.id);
    setFocusedId(photo.id);
    setFocusedPlainId(null);
    setPreviewTab("preview");
    setPreviewSize(undefined);
  }, [anchorId, selectedIds, setSelectedIds, visibleJpgs]);

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

  const moveGridFocus = useCallback((direction: BridgeGridDirection) => {
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
    setSelectedIds(new Set([targetId]));
    setAnchorId(targetId);
    setPreviewSize(undefined);
    elements.find((element) => element.dataset.bridgePhotoId === targetId)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedId, setSelectedIds, visibleJpgs]);

  const labelTargets = useCallback((focusedOnly = false) => {
    if (focusedOnly) return focusedId ? new Set([focusedId]) : new Set<string>();
    return selectedIds.size ? selectedIds : focusedId ? new Set([focusedId]) : new Set<string>();
  }, [focusedId, selectedIds]);

  const applyRating = useCallback((rating: number, focusedOnly = false) => {
    const targets = labelTargets(focusedOnly);
    if (!targets.size) return;
    setRatings((previous) => updateBridgeRatings(previous, targets, rating));
    const ratingsByName = Object.fromEntries(scan.jpgs.flatMap((photo) => targets.has(photo.id) ? [[photo.name, rating] as const] : []));
    setJpgRatingsByName(ratingsByName, { overwrite: true });
  }, [labelTargets, scan.jpgs, setJpgRatingsByName]);

  const applyColorLabel = useCallback((label: BridgeColorLabel, focusedOnly = false) => {
    const targets = labelTargets(focusedOnly);
    if (!targets.size) return;
    setColorLabels((previous) => toggleBridgeColorLabel(previous, targets, label));
  }, [labelTargets]);

  const toggleExcluded = useCallback(() => {
    const targets = selectedIds.size ? selectedIds : focusedId ? new Set([focusedId]) : new Set<string>();
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
  }, [focusedId, selectedIds]);

  const closeFullscreenPreview = useCallback(() => {
    setFullscreenPreviewOpen(false);
    requestAnimationFrame(() => rootRef.current?.focus());
  }, []);

  const openFullscreenPreview = useCallback(() => {
    if (!focusedPhoto || focusedIndex < 0) return;
    setFullscreenPreviewOpen(true);
  }, [focusedIndex, focusedPhoto]);

  const applyLabelFilterCommand = useCallback((command: BridgeLabelFilterCommand) => {
    if (fullscreenPreviewOpen) closeFullscreenPreview();
    if (command.kind === "all") {
      setLabelFilter(null);
      setFileFilter("all");
      return;
    }
    setLabelFilter(command);
    setFileFilter("jpg");
  }, [closeFullscreenPreview, fullscreenPreviewOpen]);

  const chooseFileFilter = useCallback((filter: FileFilter) => {
    setLabelFilter(null);
    setFileFilter(filter);
    setFilterMenuOpen(false);
  }, []);

  const resizeThumbnails = useCallback((direction: -1 | 1) => {
    setThumbnailSize((value) => Math.min(
      THUMBNAIL_SIZE_MAX,
      Math.max(THUMBNAIL_SIZE_MIN, value + (direction * THUMBNAIL_SIZE_STEP)),
    ));
  }, []);

  const handleKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && (folderSourceOpen || nasPickerOpen)) {
      event.preventDefault();
      setFolderSourceOpen(false);
      setNasPickerOpen(false);
      rootRef.current?.focus();
      return;
    }
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
    if (event.altKey && event.metaKey && !event.ctrlKey && !event.shiftKey) {
      const command = bridgeLabelFilterCommandFromShortcutCode(event.code);
      if (command) {
        event.preventDefault();
        applyLabelFilterCommand(command);
        return;
      }
    }
    if (fullscreenPreviewOpen) {
      if (event.key === "Escape" || event.key === " ") {
        event.preventDefault();
        closeFullscreenPreview();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(-1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(1);
      } else if (/^[0-5]$/.test(event.key)) {
        event.preventDefault();
        applyRating(Number(event.key), true);
      } else if (/^[6-9]$/.test(event.key)) {
        event.preventDefault();
        applyColorLabel(Number(event.key) as BridgeColorLabel, true);
      }
      return;
    }
    if (event.key === "Escape") {
      if (sceneReviewOpen) setSceneReviewOpen(false);
      else if (toolKey) setToolKey(undefined);
      return;
    }
    if (toolKey || sceneReviewOpen) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); moveGridFocus("left"); }
    else if (event.key === "ArrowRight") { event.preventDefault(); moveGridFocus("right"); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveGridFocus("up"); }
    else if (event.key === "ArrowDown") { event.preventDefault(); moveGridFocus("down"); }
    else if (event.key === " " && isSpaceShortcutTarget(event.target, event.currentTarget)) { event.preventDefault(); openFullscreenPreview(); }
    else if (/^[0-5]$/.test(event.key)) applyRating(Number(event.key));
    else if (/^[6-9]$/.test(event.key)) applyColorLabel(Number(event.key) as BridgeColorLabel);
    else if (event.key.toLocaleLowerCase("en-US") === "x" || (event.altKey && event.key === "Delete")) { event.preventDefault(); toggleExcluded(); }
  }, [applyColorLabel, applyLabelFilterCommand, applyRating, closeFullscreenPreview, folderSourceOpen, fullscreenPreviewOpen, moveFocus, moveGridFocus, nasPickerOpen, openFullscreenPreview, resizeThumbnails, sceneReviewOpen, toggleExcluded, toolKey]);

  const openTool = useCallback((key: ToolKey) => {
    if (!currentLocalFolder && !(remoteFolder && key === "classification")) return;
    setSceneReviewOpen(false);
    if (key === "classification") {
      setToolKey(undefined);
      setSceneReviewOpen(true);
      void syncAdobeBridgeSelection();
      return;
    }
    setToolKey(key);
  }, [currentLocalFolder, remoteFolder, syncAdobeBridgeSelection]);

  const toolDisabledReason = useCallback((key: ToolKey) => {
    if (activeFolder) return undefined;
    if (remoteFolder && key === "classification") return undefined;
    if (remoteFolder) return "이 도구는 현재 로컬 폴더에서만 실행할 수 있습니다.";
    return "사진 폴더를 먼저 선택해 주세요.";
  }, [activeFolder, remoteFolder]);

  useEffect(() => {
    if (!toolMenuOpen && !filterMenuOpen) return;
    const closeMenus = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-bridge-popover]")) return;
      setToolMenuOpen(false);
      setFilterMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, [filterMenuOpen, toolMenuOpen]);

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
    const hasStar = matchesBridgeSelectionView(photo.id, "starred", effectiveRatings, colorLabels);
    const hasColor = matchesBridgeSelectionView(photo.id, "colored", effectiveRatings, colorLabels);
    if (hasStar) counts.starred += 1;
    if (hasColor) counts.colored += 1;
    if (hasStar || hasColor) counts.selected += 1;
    else counts.unselected += 1;
    return counts;
  }, { starred: 0, colored: 0, selected: 0, unselected: 0 }), [colorLabels, effectiveRatings, scan.jpgs]);
  const labeledCount = selectionCounts.selected;
  const activeLabelFilterName = labelFilter ? bridgeLabelFilterName(labelFilter) : null;
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
        <strong>Olivia Bridge</strong>
        <button type="button" className={styles.folderPickerButton} onClick={(event) => { event.stopPropagation(); openFolderSourceChooser(); }} aria-haspopup="dialog" aria-expanded={folderSourceOpen}><FolderOpen size={17} /> 폴더 선택</button>
        <div className={styles.breadcrumbs} aria-label="현재 폴더 경로">
          {remoteFolder ? <span>NAS · {remoteFolder.displayPath}</span> : breadcrumbs.length ? breadcrumbs.map((item, index) => (
            <span key={`${item.name}-${index}`}>{index ? <ChevronRight size={12} /> : null}<button type="button" onClick={() => void loadDirectory(item.handle, breadcrumbs.slice(0, index + 1))}>{item.name}</button></span>
          )) : <span>작업할 촬영 폴더를 선택해 주세요.</span>}
        </div>
        <nav className={styles.toolBar} aria-label="Bridge 사진 도구">
          {TOOL_ITEMS.slice(0, 4).map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => openTool(key)} disabled={Boolean(toolDisabledReason(key))} className={toolKey === key || (key === "classification" && sceneReviewOpen) ? styles.activeTool : ""} aria-label={label} title={toolDisabledReason(key) ?? label}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></button>
          ))}
          <div className={styles.toolMore} data-bridge-popover>
            <button type="button" aria-haspopup="menu" aria-expanded={toolMenuOpen} onClick={() => setToolMenuOpen((value) => !value)} title="더보기"><MoreHorizontal size={18} /><span>더보기</span></button>
            {toolMenuOpen ? <div className={styles.toolMoreMenu} role="menu">
              {TOOL_ITEMS.slice(4).map(({ key, label, icon: Icon }) => {
                const disabledReason = toolDisabledReason(key);
                return <button key={key} type="button" role="menuitem" disabled={Boolean(disabledReason)} title={disabledReason ?? label} onClick={() => { setToolMenuOpen(false); openTool(key); }}><Icon size={16} /><span><strong>{label}</strong>{disabledReason ? <small>{disabledReason}</small> : null}</span></button>;
              })}
            </div> : null}
          </div>
        </nav>
        <button type="button" className={`${styles.sceneStatusButton} ${sceneState.status === "complete" ? styles.sceneReady : sceneState.status === "error" ? styles.sceneFailed : ""}`} onClick={() => { if (!hasActiveFolder) return; setSceneReviewOpen(true); void syncAdobeBridgeSelection(); }} disabled={!hasActiveFolder} aria-label={sceneState.stage} title={sceneState.stage}>
          {sceneState.status === "running" ? <LoaderCircle className={styles.spin} size={15} /> : sceneState.status === "error" ? <CircleAlert size={15} /> : <Sparkles size={15} />}
          <span>{sceneState.status === "running" ? `${sceneState.completed}/${sceneState.total}` : sceneState.stage}</span>
        </button>
      </header>

      <main ref={workspaceRef} className={styles.workspace} data-compact-preview={compactPreviewOpen ? "true" : "false"}>
        <aside ref={folderPanelRef} id="olivia-bridge-folder-panel" className={styles.folderPanel} aria-label="폴더와 파일 필터">
          <div className={styles.panelTitle}><span>폴더</span><button type="button" onClick={openFolderSourceChooser} aria-label="폴더 추가"><FolderPlus size={17} /></button></div>
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
          <div className={styles.folderList}>
            {scan.folders.length ? <small>다른 폴더</small> : null}
            {scan.folders.map((folder) => <button key={folder.name} type="button" onClick={() => void loadDirectory(folder, [...breadcrumbs, { name: folder.name, handle: folder }])}><Folder size={15} /><span>{folder.name}</span><ChevronRight size={12} /></button>)}
            {activeFolder && !scan.folders.length ? <p>하위 폴더가 없습니다.</p> : null}
          </div>
          <div className={styles.filterList}>
            <small>파일 필터</small>
            {fileFilters.map((filter) => <button key={filter.key} type="button" className={!labelFilter && fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => chooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count}</b></button>)}
            <small>셀렉 보기</small>
            {selectionFilters.map((filter) => <button key={filter.key} type="button" className={!labelFilter && fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => chooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count}</b></button>)}
          </div>
          <div className={styles.folderSummary}><span>선택 <b>{selectedIds.size}</b></span><span>레이블 <b>{labeledCount}</b></span><span>제외 <b>{excludedIds.size}</b></span></div>
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
            <div><strong>{activeFolder?.name ?? "폴더 내용"}</strong><span>{centerFileCount.toLocaleString("ko-KR")}개의 파일{scan.nestedJpgCount ? ` · 하위 JPG ${scan.nestedJpgCount.toLocaleString("ko-KR")}장` : ""}</span></div>
            <div className={styles.browserActions}>
              <div className={styles.filterMenuHost} data-bridge-popover>
                <button type="button" className={styles.filterMenuButton} aria-haspopup="menu" aria-expanded={filterMenuOpen} onClick={() => setFilterMenuOpen((value) => !value)}><SlidersHorizontal size={15} /> 폴더·필터</button>
                {filterMenuOpen ? <div className={styles.filterMenu} role="menu">
                  <label><input type="checkbox" checked={includeNestedJpgs} disabled={!activeFolder || scanStatus === "loading"} onChange={(event) => changeNestedJpgVisibility(event.currentTarget.checked)} /><span>하위 폴더 JPG 포함</span><b>{scan.nestedJpgCount}</b></label>
                  {scan.folders.length ? <><small>하위 폴더</small>{scan.folders.map((folder) => <button key={folder.name} type="button" role="menuitem" onClick={() => { setFilterMenuOpen(false); void loadDirectory(folder, [...breadcrumbs, { name: folder.name, handle: folder }]); }}><Folder size={14} /><span>{folder.name}</span><ChevronRight size={12} /></button>)}</> : null}
                  <small>셀렉 보기</small>
                  {[...selectionFilters, fileFilters[4]].map((filter) => <button key={filter.key} type="button" role="menuitemradio" aria-checked={!labelFilter && fileFilter === filter.key} onClick={() => chooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count}</b></button>)}
                </div> : null}
              </div>
              <button type="button" className={styles.compactPreviewButton} onClick={() => setCompactPreviewOpen(true)} aria-label="미리보기 열기"><Maximize2 size={15} /> 미리보기</button>
              <div className={styles.thumbnailControls}><button type="button" onClick={() => resizeThumbnails(-1)} aria-label="썸네일 작게"><Minus size={15} /></button><LayoutGrid size={16} aria-hidden="true" /><button type="button" onClick={() => resizeThumbnails(1)} aria-label="썸네일 크게"><Plus size={15} /></button></div>
            </div>
          </div>
          <div className={styles.fileTypeTabs} role="tablist" aria-label="파일 형식">
            {fileFilters.slice(0, 4).map((filter) => <button key={filter.key} type="button" role="tab" aria-selected={!labelFilter && fileFilter === filter.key} onClick={() => chooseFileFilter(filter.key)}>{filter.label} <span>{filter.count.toLocaleString("ko-KR")}</span></button>)}
          </div>

          {scanStatus === "idle" ? <div className={styles.emptyState}><FolderOpen size={34} /><strong>{restoreTrail.length ? "지난 작업 폴더를 다시 열까요?" : "촬영 폴더를 선택해 주세요"}</strong><p>{restoreMessage || "JPG는 썸네일로, RAW와 사이드카는 파일 정보로 표시합니다."}</p>{restoreTrail.length ? <div className={styles.restoreActions}><button type="button" onClick={() => void restoreLastFolder()}>지난 폴더 다시 열기</button><button type="button" className={styles.restoreSecondary} onClick={openFolderSourceChooser}>다른 폴더 선택</button></div> : <button type="button" onClick={openFolderSourceChooser}>폴더 선택</button>}</div> : null}
          {scanStatus === "restoring" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>지난 작업 폴더를 확인하는 중입니다</strong><p>권한이 유지되어 있으면 마지막 폴더를 그대로 엽니다.</p></div> : null}
          {scanStatus === "loading" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>폴더를 읽는 중입니다</strong><p>화면에 필요한 JPG부터 썸네일을 만듭니다.</p></div> : null}
          {scanStatus === "error" ? <div className={styles.emptyState}><CircleAlert size={30} /><strong>폴더를 읽지 못했습니다</strong><p>{scanError}</p><button type="button" onClick={openFolderSourceChooser}>다른 폴더 선택</button></div> : null}
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
                  const focused = focusedId === photo.id;
                  const excluded = excludedIds.has(photo.id);
                  const rating = effectiveRatings[photo.id] ?? 0;
                  const colorLabel = colorLabels[photo.id];
                  const color = colorLabel ? BRIDGE_COLOR_LABELS[colorLabel] : null;
                  return <button key={photo.id} type="button" data-bridge-photo-id={photo.id} data-nested={photo.relativeDirectory ? "true" : "false"} className={`${styles.thumbnailCard} ${selected ? styles.selected : ""} ${focused ? styles.focused : ""} ${excluded ? styles.excluded : ""}`} onClick={(event) => { if (isMacControlClick(event)) return; choosePhoto(photo, event); }} onContextMenu={(event) => { if (!isMacControlClick(event)) return; event.preventDefault(); choosePhoto(photo, event); }} aria-pressed={selected}><BridgeThumbnail photo={photo} alt={photo.name} /><span className={styles.photoName}>{photo.name}</span>{photo.relativeDirectory ? <span className={styles.photoPath}>{photo.relativeDirectory}</span> : null}{rating ? <span className={styles.rating}><Star size={11} fill="currentColor" />{rating}</span> : null}{color ? <span className={styles.colorLabelMark} style={{ background: color.color }} aria-label={`${color.name} 컬러 레이블`} /> : null}{excluded ? <span className={styles.rejectMark}>X</span> : null}{selected ? <span className={styles.selectMark} aria-label="선택됨" /> : null}</button>;
                })}
              </div> : null}
              {showRaws && scan.raws.length ? <section className={styles.plainFileSection}><header><strong>RAW</strong><span>미리보기 없이 형식과 파일명만 표시</span></header><div>{scan.raws.map((file) => <PlainFileCard key={file.id} file={file} active={focusedPlainFile?.id === file.id} onClick={() => { setFocusedPlainId(file.id); setFocusedId(null); setPreviewTab("preview"); }} />)}</div></section> : null}
              {showSidecars && scan.sidecars.length ? <section className={styles.plainFileSection}><header><strong>사이드카</strong><span>원본과 함께 유지되는 설정 파일</span></header><div>{scan.sidecars.map((file) => <PlainFileCard key={file.id} file={file} active={focusedPlainFile?.id === file.id} onClick={() => { setFocusedPlainId(file.id); setFocusedId(null); setPreviewTab("preview"); }} />)}</div></section> : null}
              {!visibleJpgs.length && (!showRaws || !scan.raws.length) && (!showSidecars || !scan.sidecars.length) ? <div className={styles.noPhotos}><Images size={27} /><span>이 조건에 맞는 파일이 없습니다.</span></div> : null}
            </div>
          ) : null}
          <footer className={styles.shortcutBar}>
            <div className={styles.shortcutHints}>{activeLabelFilterName ? <b className={styles.shortcutActiveFilter}>필터: {activeLabelFilterName}</b> : null}<span>드래그 영역 선택</span><span>⌘/Ctrl/Shift 드래그 추가</span><span>← ↑ ↓ → 사진 이동</span><span>Space OS 창 미리보기</span><span>⌘/Ctrl 클릭 추가 선택</span><span>Shift 범위 선택</span><span>1–5 별점 · 0 해제</span><span>6–9 컬러 · 같은 키 해제</span><span>⌥⌘1–5 별점만 · ⌥⌘6–9 컬러만 · ⌥⌘A 전체</span><span>X 제외</span>{scan.unreadableFolderCount ? <i>하위 폴더 {scan.unreadableFolderCount}곳을 읽지 못함</i> : null}{scan.ignoredCount ? <i>숨김·기타 {scan.ignoredCount}개 제외</i> : null}</div>
            <label className={styles.thumbnailGauge} title="⌘ + / ⌘ -">
              <Minus size={13} aria-hidden="true" />
              <input
                type="range"
                min={THUMBNAIL_SIZE_MIN}
                max={THUMBNAIL_SIZE_MAX}
                step={THUMBNAIL_SIZE_STEP}
                value={thumbnailSize}
                onChange={(event) => setThumbnailSize(Number(event.currentTarget.value))}
                aria-label="썸네일 크기"
              />
              <Plus size={13} aria-hidden="true" />
              <span>⌘ + / -</span>
            </label>
          </footer>
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
            <button type="button" role="tab" aria-selected={previewTab === "preview"} onClick={() => setPreviewTab("preview")}>미리보기</button>
            <button type="button" role="tab" aria-selected={previewTab === "olivia"} onClick={() => setPreviewTab("olivia")}>Olivia</button>
          </div>
          {previewTab === "olivia" ? (
            <div className={styles.previewOlivia}><div><strong>{folderPath || "폴더 미선택"}</strong><span>{focusedPhoto?.name ?? focusedPlainFile?.name ?? "파일 미선택"} · 선택 JPG {selectedNames.length}장</span></div><OliviaChatDockTarget id="olivia-bridge-preview" priority={92} className={styles.previewOliviaDock} /></div>
          ) : focusedPhoto ? <><div className={styles.previewCanvas} onDoubleClick={openFullscreenPreview}><button type="button" className={`${styles.previewArrow} ${styles.previewArrowLeft}`} onClick={() => moveFocus(-1)} disabled={focusedIndex <= 0} aria-label="이전 사진"><ChevronLeft size={22} /></button><BridgePreviewImage photo={focusedPhoto} onSize={setPreviewSize} /><button type="button" className={`${styles.previewArrow} ${styles.previewArrowRight}`} onClick={() => moveFocus(1)} disabled={focusedIndex < 0 || focusedIndex >= visibleJpgs.length - 1} aria-label="다음 사진"><ChevronRight size={22} /></button></div><div className={styles.previewMeta}><strong>{focusedPhoto.name}</strong><span>{previewSize ? `${previewSize.width} × ${previewSize.height}` : "크기 확인 중"}</span><i /><span>{formatBytes(focusedPhoto.size)}</span><i /><span>{focusedPhoto.extension}</span><div className={styles.previewRatings} aria-label="별점">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${rating}점`} aria-pressed={(effectiveRatings[focusedPhoto.id] ?? 0) >= rating} onClick={() => applyRating(rating, true)}><Star size={15} fill={(effectiveRatings[focusedPhoto.id] ?? 0) >= rating ? "currentColor" : "none"} /></button>)}<button type="button" onClick={() => applyRating(0, true)}>해제</button></div><button type="button" className={styles.previewSelectButton} onClick={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(focusedPhoto.id)) next.delete(focusedPhoto.id); else next.add(focusedPhoto.id); return next; })}><Check size={13} />{selectedIds.has(focusedPhoto.id) ? "선택됨" : "선택"}</button><button type="button" className={styles.previewExpandButton} onClick={openFullscreenPreview}><Maximize2 size={13} /> 크게 보기</button></div></> : focusedPlainFile ? <div className={styles.previewFileInfo}><File size={42} /><strong>{focusedPlainFile.name}</strong><span>{focusedPlainFile.extension} · {formatBytes(focusedPlainFile.size)}</span><p>RAW와 사이드카는 파일 정보만 표시하며 미리보기를 만들지 않습니다.</p></div> : <div className={styles.previewEmpty}><Images size={34} /><strong>미리 볼 파일을 선택해 주세요</strong><span>RAW와 사이드카는 미리보기를 만들지 않습니다.</span></div>}
        </aside>
      </main>

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

      {fullscreenPreviewOpen && focusedPhoto ? (
        <BridgeFullscreenPreview
          photo={focusedPhoto}
          position={focusedIndex + 1}
          total={visibleJpgs.length}
          rating={effectiveRatings[focusedPhoto.id] ?? 0}
          colorLabel={colorLabels[focusedPhoto.id]}
          canMovePrevious={focusedIndex > 0}
          canMoveNext={focusedIndex >= 0 && focusedIndex < visibleJpgs.length - 1}
          onMove={moveFocus}
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

      {nasPickerOpen ? (
        <PhotoSourcePicker
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
