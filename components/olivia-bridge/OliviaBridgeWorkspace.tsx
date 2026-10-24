"use client";

import dynamic from "next/dynamic";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Images,
  LayoutGrid,
  Link2,
  LoaderCircle,
  Minus,
  PencilLine,
  Plus,
  RefreshCw,
  Scaling,
  ScanSearch,
  Scissors,
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
  scanBridgeFolder,
  updateBridgeSelection,
  type BridgeFolderScan,
  type BridgeJpgFile,
  type BridgeRawFile,
  type BridgeScene,
} from "@/lib/photo-bridge/bridgeFiles";
import type { BridgeFloatingWindowRect } from "@/lib/photo-bridge/floatingWindow";
import {
  bridgeGridNavigationTarget,
  type BridgeGridDirection,
} from "@/lib/photo-bridge/gridNavigation";
import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";
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
  countBridgeLabeledFiles,
  hasBridgeLabel,
  matchesBridgeLabelFilter,
  normalizeBridgeColorLabels,
  toggleBridgeColorLabel,
  updateBridgeRatings,
  type BridgeColorLabel,
  type BridgeColorLabels,
  type BridgeLabelFilter,
  type BridgeLabelFilterCommand,
} from "@/lib/photo-bridge/labels";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import type { PhotoFileOpsMode, PhotoSelectMode, PhotoWorkspaceMode } from "@/components/photo-workspace/types";
import styles from "./OliviaBridgeWorkspace.module.css";

const EmbeddedPhotoTool = dynamic(
  () => import("@/components/photo-workspace/PhotoWorkspace").then((module) => module.PhotoWorkspaceEmbeddedTool),
  {
    ssr: false,
    loading: () => <div className={styles.toolLoading}><LoaderCircle size={18} /> 기존 사진 도구를 여는 중...</div>,
  },
);

type Breadcrumb = { name: string; handle: FileSystemDirectoryHandle };
type SceneState = {
  status: "idle" | "running" | "complete" | "error";
  stage: string;
  completed: number;
  total: number;
  scenes: BridgeScene[];
  error?: string;
};
type ToolKey = "jpg-prep" | "select" | "raw-match" | "classification" | "tcut" | "resize" | "rename" | "retouch";
type FileFilter = "all" | "jpg" | "raw" | "sidecar" | "rated" | "labeled" | "excluded";
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

const EMPTY_SCAN: BridgeFolderScan = { folders: [], jpgs: [], raws: [], sidecars: [], ignoredCount: 0 };

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

function PlainFileCard({ file }: { file: BridgeRawFile }) {
  return (
    <article className={styles.plainFileCard}>
      <File size={30} strokeWidth={1.5} aria-hidden="true" />
      <span>{file.extension}</span>
      <strong title={file.name}>{file.name}</strong>
      <small>{formatBytes(file.size)}</small>
    </article>
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

export default function OliviaBridgeWorkspace() {
  const picker = usePhotoFolderPicker();
  const {
    currentLocalFolder,
    setCurrentLocalFolder,
    setRawMatchDefaultFolder,
    selectedJpgNames,
    setSelectedJpgNames,
    setSelectedJpgFiles,
    jpgRatingsByName,
    setJpgRatingsByName,
    setExecutionMode,
  } = usePhotoStudioExecution();
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [scan, setScan] = useState<BridgeFolderScan>(EMPTY_SCAN);
  const [scanStatus, setScanStatus] = useState<"idle" | "restoring" | "loading" | "ready" | "error">("restoring");
  const [scanError, setScanError] = useState<string>();
  const [restoreTrail, setRestoreTrail] = useState<Breadcrumb[]>([]);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [selectedIds, setSelectedIdsState] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [toolKey, setToolKey] = useState<ToolKey>();
  const [sceneReviewOpen, setSceneReviewOpen] = useState(false);
  const [thumbnailSize, setThumbnailSize] = useState(156);
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [labelFilter, setLabelFilter] = useState<BridgeLabelFilter | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [colorLabels, setColorLabels] = useState<BridgeColorLabels>({});
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>();
  const [sceneState, setSceneState] = useState<SceneState>({ status: "idle", stage: "폴더를 선택해 주세요", completed: 0, total: 0, scenes: [] });
  const [sceneRunKey, setSceneRunKey] = useState(0);
  const [fullscreenPreviewOpen, setFullscreenPreviewOpen] = useState(false);
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

  const activeFolder = breadcrumbs.at(-1)?.handle ?? null;
  const folderPath = breadcrumbs.map((item) => item.name).join(" / ");
  const selectedNames = useMemo(() => scan.jpgs.filter((photo) => selectedIds.has(photo.id)).map((photo) => photo.name), [scan.jpgs, selectedIds]);
  const visibleJpgs = useMemo(() => scan.jpgs.filter((photo) => {
    if (labelFilter) return matchesBridgeLabelFilter(photo.id, labelFilter, ratings, colorLabels);
    if (fileFilter === "raw" || fileFilter === "sidecar") return false;
    if (fileFilter === "rated") return Boolean(ratings[photo.id]);
    if (fileFilter === "labeled") return hasBridgeLabel(photo.id, ratings, colorLabels);
    if (fileFilter === "excluded") return excludedIds.has(photo.id);
    return true;
  }), [colorLabels, excludedIds, fileFilter, labelFilter, ratings, scan.jpgs]);
  const showRaws = !labelFilter && (fileFilter === "all" || fileFilter === "raw");
  const showSidecars = !labelFilter && (fileFilter === "all" || fileFilter === "sidecar");
  const focusedIndex = useMemo(() => visibleJpgs.findIndex((photo) => photo.id === focusedId), [focusedId, visibleJpgs]);
  const focusedPhoto = scan.jpgs.find((photo) => photo.id === focusedId) ?? null;
  const activeTool = TOOL_ITEMS.find((item) => item.key === toolKey);

  const setSelectedIds = useCallback((value: Set<string> | ((current: Set<string>) => Set<string>)) => {
    const next = typeof value === "function" ? value(selectedIdsRef.current) : value;
    selectedIdsRef.current = next;
    setSelectedIdsState(next);
    setSelectedJpgNames(scan.jpgs.filter((photo) => next.has(photo.id)).map((photo) => photo.name));
  }, [scan.jpgs, setSelectedJpgNames]);

  const updateFloatingWindowRect = useCallback((windowId: string, rect: BridgeFloatingWindowRect) => {
    floatingWindowRectsRef.current[windowId] = rect;
  }, []);

  useEffect(() => {
    setSelectedJpgFiles(scan.jpgs.filter((photo) => selectedIds.has(photo.id)).map((photo) => photo.file));
  }, [scan.jpgs, selectedIds, setSelectedJpgFiles]);

  useEffect(() => {
    const selectedKeys = new Set(selectedJpgNames.map(normalizePhotoToolFileKey).filter(Boolean));
    const next = new Set(scan.jpgs.filter((photo) => selectedKeys.has(normalizePhotoToolFileKey(photo.name))).map((photo) => photo.id));
    setSelectedIdsState((current) => {
      if (current.size === next.size && [...current].every((id) => next.has(id))) return current;
      selectedIdsRef.current = next;
      return next;
    });
  }, [scan.jpgs, selectedJpgNames]);

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
    if (!labelFilter || focusedIndex >= 0) return;
    const next = visibleJpgs[0] ?? null;
    setFocusedId(next?.id ?? null);
    setAnchorId(next?.id ?? null);
    setPreviewSize(undefined);
  }, [focusedIndex, labelFilter, visibleJpgs]);

  useEffect(() => {
    if (!folderPath) return;
    try {
      localStorage.setItem(`olivia-bridge:marks:${folderPath}`, JSON.stringify({ ratings, colorLabels, excluded: [...excludedIds] }));
    } catch (error) {
      void error;
    }
  }, [colorLabels, excludedIds, folderPath, ratings]);

  const loadDirectory = useCallback(async (directory: FileSystemDirectoryHandle, trail: Breadcrumb[]) => {
    setScanStatus("loading");
    setScanError(undefined);
    setToolKey(undefined);
    setSceneReviewOpen(false);
    try {
      const nextPath = trail.map((item) => item.name).join(" / ");
      const next = await scanBridgeFolder(directory, nextPath);
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
      setBreadcrumbs(trail);
      setRawMatchDefaultFolder(bridgeRawMatchDefaultFolder(trail));
      setRestoreTrail([]);
      setRestoreMessage("");
      setSelectedIds(new Set());
      setAnchorId(null);
      setFocusedId(next.jpgs[0]?.id ?? null);
      setPreviewSize(undefined);
      setFileFilter("all");
      setCurrentLocalFolder(directory);
      const restoredRatingsByName = Object.fromEntries(next.jpgs.flatMap((photo) => {
        const rating = restoredRatings[photo.id];
        return rating ? [[photo.name, rating] as const] : [];
      }));
      setJpgRatingsByName(restoredRatingsByName, { overwrite: true });
      setExecutionMode("LOCAL_DIRECT");
      setScanStatus("ready");
      void saveBridgeFolderTrail(trail).catch((error) => {
        console.error("[olivia-bridge] Failed to remember the last folder", error);
      });
      rootRef.current?.focus();
    } catch (error) {
      setScanStatus("error");
      setScanError(error instanceof Error ? error.message : "폴더를 읽지 못했습니다.");
    }
  }, [setCurrentLocalFolder, setExecutionMode, setJpgRatingsByName, setRawMatchDefaultFolder, setSelectedIds]);

  const chooseFolder = useCallback(async () => {
    const directory = await picker.pick("readwrite");
    if (!directory) return;
    await loadDirectory(directory, [{ name: directory.name, handle: directory }]);
  }, [loadDirectory, picker]);

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

  useEffect(() => {
    if (!activeFolder || scanStatus !== "ready") {
      setSceneState({ status: "idle", stage: "폴더를 선택해 주세요", completed: 0, total: 0, scenes: [] });
      return;
    }
    if (!scan.jpgs.length) {
      setSceneState({ status: "complete", stage: "분석할 JPG가 없습니다", completed: 0, total: 0, scenes: [] });
      return;
    }
    const controller = new AbortController();
    setSceneState({ status: "running", stage: "AI Scene 사전 분석 준비", completed: 0, total: scan.jpgs.length, scenes: [] });
    void analyzeBridgeScenes({
      folderKey: folderPath,
      jpgs: scan.jpgs,
      signal: controller.signal,
      onProgress: (completed, total, stage) => setSceneState((previous) => ({ ...previous, status: "running", completed, total, stage })),
    }).then((scenes) => setSceneState({ status: "complete", stage: "Scene 분류 계획 준비됨", completed: scan.jpgs.length, total: scan.jpgs.length, scenes }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSceneState({ status: "error", stage: "Scene 분석 오류", completed: 0, total: scan.jpgs.length, scenes: [], error: error instanceof Error ? error.message : "Scene 분석에 실패했습니다." });
      });
    return () => controller.abort();
  }, [activeFolder, folderPath, scan.jpgs, scanStatus, sceneRunKey]);

  const choosePhoto = useCallback((photo: BridgeJpgFile, event: ReactMouseEvent) => {
    const next = updateBridgeSelection({ current: selectedIds, orderedIds: visibleJpgs.map((item) => item.id), clickedId: photo.id, anchorId, additive: event.metaKey || event.ctrlKey, range: event.shiftKey });
    setSelectedIds(next);
    setAnchorId(photo.id);
    setFocusedId(photo.id);
    setPreviewSize(undefined);
  }, [anchorId, selectedIds, setSelectedIds, visibleJpgs]);

  const moveFocus = useCallback((delta: number) => {
    if (!visibleJpgs.length) return;
    const current = focusedIndex >= 0 ? focusedIndex : 0;
    const nextIndex = Math.max(0, Math.min(visibleJpgs.length - 1, current + delta));
    const next = visibleJpgs[nextIndex];
    setFocusedId(next.id);
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
  }, []);

  const handleKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
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
    else if (event.key === "+" || event.key === "=") setThumbnailSize((value) => Math.min(240, value + 18));
    else if (event.key === "-") setThumbnailSize((value) => Math.max(96, value - 18));
  }, [applyColorLabel, applyLabelFilterCommand, applyRating, closeFullscreenPreview, fullscreenPreviewOpen, moveFocus, moveGridFocus, openFullscreenPreview, sceneReviewOpen, toggleExcluded, toolKey]);

  const openTool = useCallback((key: ToolKey) => {
    if (!currentLocalFolder) return;
    setSceneReviewOpen(false);
    if (key === "classification") {
      setToolKey(undefined);
      setSceneReviewOpen(true);
      return;
    }
    setToolKey(key);
  }, [currentLocalFolder]);

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

  const labeledCount = countBridgeLabeledFiles(scan.jpgs.map((photo) => photo.id), ratings, colorLabels);
  const activeLabelFilterName = labelFilter ? bridgeLabelFilterName(labelFilter) : null;
  const filters: Array<{ key: FileFilter; label: string; count: number }> = [
    { key: "all", label: "모든 파일", count: scan.jpgs.length + scan.raws.length + scan.sidecars.length },
    { key: "jpg", label: "JPG", count: scan.jpgs.length },
    { key: "raw", label: "RAW", count: scan.raws.length },
    { key: "sidecar", label: "사이드카", count: scan.sidecars.length },
    { key: "rated", label: "별점", count: Object.keys(ratings).length },
    { key: "labeled", label: "레이블 있음", count: labeledCount },
    { key: "excluded", label: "제외", count: excludedIds.size },
  ];
  const scenePhotoByName = useMemo(() => new Map(scan.jpgs.map((photo) => [photo.name, photo])), [scan.jpgs]);
  const sceneBoundaryReviewCount = useMemo(() => sceneState.scenes.filter((scene) => scene.needsReview).length, [sceneState.scenes]);
  const centerFileCount = visibleJpgs.length + (showRaws ? scan.raws.length : 0) + (showSidecars ? scan.sidecars.length : 0);

  return (
    <div ref={rootRef} className={styles.bridge} tabIndex={0} onKeyDown={handleKeyboard} aria-label="Olivia Bridge 사진 작업공간">
      <header className={styles.bridgeBar}>
        <strong>OLIVIA BRIDGE</strong>
        <button type="button" className={styles.folderPickerButton} onClick={() => void chooseFolder()}><FolderOpen size={17} /> 폴더 선택</button>
        <div className={styles.breadcrumbs} aria-label="현재 폴더 경로">
          {breadcrumbs.length ? breadcrumbs.map((item, index) => (
            <span key={`${item.name}-${index}`}>{index ? <ChevronRight size={12} /> : null}<button type="button" onClick={() => void loadDirectory(item.handle, breadcrumbs.slice(0, index + 1))}>{item.name}</button></span>
          )) : <span>작업할 촬영 폴더를 선택해 주세요.</span>}
        </div>
        <nav className={styles.toolBar} aria-label="Bridge 사진 도구">
          {TOOL_ITEMS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => openTool(key)} disabled={!activeFolder} className={toolKey === key || (key === "classification" && sceneReviewOpen) ? styles.activeTool : ""} aria-label={label} title={label}><Icon size={18} strokeWidth={1.8} /></button>
          ))}
        </nav>
        <button type="button" className={`${styles.sceneStatusButton} ${sceneState.status === "complete" ? styles.sceneReady : sceneState.status === "error" ? styles.sceneFailed : ""}`} onClick={() => activeFolder && setSceneReviewOpen(true)} disabled={!activeFolder}>
          {sceneState.status === "running" ? <LoaderCircle className={styles.spin} size={15} /> : sceneState.status === "error" ? <CircleAlert size={15} /> : <Sparkles size={15} />}
          <span>{sceneState.status === "running" ? `${sceneState.completed}/${sceneState.total}` : sceneState.stage}</span>
        </button>
      </header>

      <main ref={workspaceRef} className={styles.workspace}>
        <aside ref={folderPanelRef} id="olivia-bridge-folder-panel" className={styles.folderPanel} aria-label="폴더와 파일 필터">
          <div className={styles.panelTitle}><span>폴더</span><button type="button" onClick={() => void chooseFolder()} aria-label="폴더 추가"><FolderPlus size={17} /></button></div>
          <button type="button" className={styles.rootFolder} onClick={() => breadcrumbs[0] && void loadDirectory(breadcrumbs[0].handle, breadcrumbs.slice(0, 1))} disabled={!breadcrumbs[0]}><FolderOpen size={17} /><span>{breadcrumbs[0]?.name ?? "촬영 폴더"}</span><b>{scan.jpgs.length + scan.raws.length + scan.sidecars.length}</b></button>
          <div className={styles.folderList}>
            {scan.folders.length ? <small>다른 폴더</small> : null}
            {scan.folders.map((folder) => <button key={folder.name} type="button" onClick={() => void loadDirectory(folder, [...breadcrumbs, { name: folder.name, handle: folder }])}><Folder size={15} /><span>{folder.name}</span><ChevronRight size={12} /></button>)}
            {activeFolder && !scan.folders.length ? <p>하위 폴더가 없습니다.</p> : null}
          </div>
          <div className={styles.filterList}>
            <small>파일 필터</small>
            {filters.map((filter) => <button key={filter.key} type="button" className={!labelFilter && fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => chooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count}</b></button>)}
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
            <div><strong>{activeFolder?.name ?? "폴더 내용"}</strong><span>{centerFileCount.toLocaleString("ko-KR")}개의 파일</span></div>
            <div className={styles.thumbnailControls}><button type="button" onClick={() => setThumbnailSize((value) => Math.max(96, value - 18))} aria-label="썸네일 작게"><Minus size={15} /></button><LayoutGrid size={16} aria-hidden="true" /><button type="button" onClick={() => setThumbnailSize((value) => Math.min(240, value + 18))} aria-label="썸네일 크게"><Plus size={15} /></button></div>
          </div>

          {scanStatus === "idle" ? <div className={styles.emptyState}><FolderOpen size={34} /><strong>{restoreTrail.length ? "지난 작업 폴더를 다시 열까요?" : "촬영 폴더를 선택해 주세요"}</strong><p>{restoreMessage || "JPG는 썸네일로, RAW와 사이드카는 파일 정보로 표시합니다."}</p>{restoreTrail.length ? <div className={styles.restoreActions}><button type="button" onClick={() => void restoreLastFolder()}>지난 폴더 다시 열기</button><button type="button" className={styles.restoreSecondary} onClick={() => void chooseFolder()}>다른 폴더 선택</button></div> : <button type="button" onClick={() => void chooseFolder()}>폴더 선택</button>}</div> : null}
          {scanStatus === "restoring" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>지난 작업 폴더를 확인하는 중입니다</strong><p>권한이 유지되어 있으면 마지막 폴더를 그대로 엽니다.</p></div> : null}
          {scanStatus === "loading" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>폴더를 읽는 중입니다</strong><p>화면에 필요한 JPG부터 썸네일을 만듭니다.</p></div> : null}
          {scanStatus === "error" ? <div className={styles.emptyState}><CircleAlert size={30} /><strong>폴더를 읽지 못했습니다</strong><p>{scanError}</p><button type="button" onClick={() => void chooseFolder()}>다른 폴더 선택</button></div> : null}
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
                  const rating = ratings[photo.id] ?? 0;
                  const colorLabel = colorLabels[photo.id];
                  const color = colorLabel ? BRIDGE_COLOR_LABELS[colorLabel] : null;
                  return <button key={photo.id} type="button" data-bridge-photo-id={photo.id} className={`${styles.thumbnailCard} ${selected ? styles.selected : ""} ${focused ? styles.focused : ""} ${excluded ? styles.excluded : ""}`} onClick={(event) => { if (isMacControlClick(event)) return; choosePhoto(photo, event); }} onContextMenu={(event) => { if (!isMacControlClick(event)) return; event.preventDefault(); choosePhoto(photo, event); }} aria-pressed={selected}><BridgeThumbnail photo={photo} alt={photo.name} /><span className={styles.photoName}>{photo.name}</span>{rating ? <span className={styles.rating}><Star size={11} fill="currentColor" />{rating}</span> : null}{color ? <span className={styles.colorLabelMark} style={{ background: color.color }} aria-label={`${color.name} 컬러 레이블`} /> : null}{excluded ? <span className={styles.rejectMark}>X</span> : null}{selected ? <span className={styles.selectMark} aria-label="선택됨" /> : null}</button>;
                })}
              </div> : null}
              {showRaws && scan.raws.length ? <section className={styles.plainFileSection}><header><strong>RAW</strong><span>미리보기 없이 형식과 파일명만 표시</span></header><div>{scan.raws.map((file) => <PlainFileCard key={file.id} file={file} />)}</div></section> : null}
              {showSidecars && scan.sidecars.length ? <section className={styles.plainFileSection}><header><strong>사이드카</strong><span>원본과 함께 유지되는 설정 파일</span></header><div>{scan.sidecars.map((file) => <PlainFileCard key={file.id} file={file} />)}</div></section> : null}
              {!visibleJpgs.length && (!showRaws || !scan.raws.length) && (!showSidecars || !scan.sidecars.length) ? <div className={styles.noPhotos}><Images size={27} /><span>이 조건에 맞는 파일이 없습니다.</span></div> : null}
            </div>
          ) : null}
          <footer className={styles.shortcutBar}>{activeLabelFilterName ? <b className={styles.shortcutActiveFilter}>필터: {activeLabelFilterName}</b> : null}<span>드래그 영역 선택</span><span>⌘/Ctrl/Shift 드래그 추가</span><span>← ↑ ↓ → 사진 이동</span><span>Space OS 창 미리보기</span><span>⌘/Ctrl 클릭 추가 선택</span><span>Shift 범위 선택</span><span>1–5 별점 · 0 해제</span><span>6–9 컬러 · 같은 키 해제</span><span>⌥⌘1–5 별점만 · ⌥⌘6–9 컬러만 · ⌥⌘A 전체</span><span>X 제외</span>{scan.ignoredCount ? <i>숨김·기타 {scan.ignoredCount}개 제외</i> : null}</footer>
        </section>


        <BridgePaneDivider
          pane="preview"
          workspaceRef={workspaceRef}
          oppositePaneRef={folderPanelRef}
          controls="olivia-bridge-preview-panel"
          label="미리보기 영역 너비 조절"
        />

        <aside ref={previewPanelRef} id="olivia-bridge-preview-panel" className={styles.previewPanel} aria-label="선택한 사진 미리보기">
          {focusedPhoto ? <><div className={styles.previewCanvas}><button type="button" className={`${styles.previewArrow} ${styles.previewArrowLeft}`} onClick={() => moveFocus(-1)} disabled={focusedIndex <= 0} aria-label="이전 사진"><ChevronLeft size={22} /></button><BridgePreviewImage photo={focusedPhoto} onSize={setPreviewSize} /><button type="button" className={`${styles.previewArrow} ${styles.previewArrowRight}`} onClick={() => moveFocus(1)} disabled={focusedIndex < 0 || focusedIndex >= visibleJpgs.length - 1} aria-label="다음 사진"><ChevronRight size={22} /></button></div><div className={styles.previewMeta}><strong>{focusedPhoto.name}</strong><span>{previewSize ? `${previewSize.width} × ${previewSize.height}` : "크기 확인 중"}</span><i /><span>{formatBytes(focusedPhoto.size)}</span><i /><span>{focusedPhoto.extension}</span></div></> : <div className={styles.previewEmpty}><Images size={34} /><strong>미리 볼 JPG를 선택해 주세요</strong><span>RAW와 사이드카는 미리보기를 만들지 않습니다.</span></div>}
        </aside>
      </main>

      {sceneReviewOpen ? <BridgeFloatingWindow
        windowId="scene-review"
        variant="scene"
        title="AI Scene 분류 검토"
        subtitle={sceneState.stage}
        ariaLabel="AI Scene 분류 검토"
        containerRef={rootRef}
        rect={floatingWindowRectsRef.current["scene-review"]}
        onRectChange={(rect) => updateFloatingWindowRect("scene-review", rect)}
        onClose={() => setSceneReviewOpen(false)}
      >
        <div className={styles.sceneBody}>
          {sceneState.status === "running" ? <div className={styles.sceneProgress}><span style={{ width: `${sceneState.total ? Math.min(100, sceneState.completed / sceneState.total * 100) : 4}%` }} /></div> : null}
          {sceneState.error ? <div className={styles.sceneError}><CircleAlert size={17} /><span>{sceneState.error}</span><button type="button" onClick={() => setSceneRunKey((value) => value + 1)}><RefreshCw size={14} /> 다시 시도</button></div> : null}
          <div className={styles.sceneGrid}>{sceneState.scenes.map((scene) => { const photo = scenePhotoByName.get(scene.representativeFileName); return <article key={scene.id}>{photo ? <BridgeThumbnail photo={photo} alt={`${scene.label} 대표 사진`} eager /> : null}<div><strong>{scene.label}</strong><span>{scene.fileCount}장</span></div><small>{scene.firstFileName} – {scene.lastFileName}</small>{scene.needsReview ? <i>경계 확인 필요</i> : null}</article>; })}{sceneState.status === "complete" && !sceneState.scenes.length ? <p>표시할 Scene이 없습니다.</p> : null}</div>
        </div>
        <footer><div className={styles.sceneApprovalSummary}><strong>Scene {sceneState.scenes.length.toLocaleString("ko-KR")}개 · JPG {sceneState.total.toLocaleString("ko-KR")}장 · 경계 확인 {sceneBoundaryReviewCount.toLocaleString("ko-KR")}곳</strong><p>{sceneState.status === "complete" ? "승인 전에는 파일을 이동하거나 이름을 바꾸지 않습니다." : "분석이 끝나면 분류 실행을 승인할 수 있습니다."}</p></div><button type="button" disabled={sceneState.status !== "complete"} onClick={() => { setSceneReviewOpen(false); setToolKey("classification"); }}><ScanSearch size={16} /> 승인하고 분류 실행</button></footer>
      </BridgeFloatingWindow> : null}

      {activeTool ? <BridgeFloatingWindow
        key={activeTool.key}
        windowId={`tool-${activeTool.key}`}
        variant="tool"
        title={activeTool.label}
        subtitle={`${activeFolder?.name} · 선택 JPG ${selectedNames.length}장`}
        ariaLabel={`${activeTool.label} 도구`}
        containerRef={rootRef}
        rect={floatingWindowRectsRef.current[`tool-${activeTool.key}`]}
        onRectChange={(rect) => updateFloatingWindowRect(`tool-${activeTool.key}`, rect)}
        onClose={() => setToolKey(undefined)}
      ><div className={styles.toolBody}><EmbeddedPhotoTool mode={activeTool.mode} selectMode={activeTool.selectMode} fileOpsMode={activeTool.fileOpsMode} /></div></BridgeFloatingWindow> : null}

      {fullscreenPreviewOpen && focusedPhoto ? (
        <BridgeFullscreenPreview
          photo={focusedPhoto}
          position={focusedIndex + 1}
          total={visibleJpgs.length}
          rating={ratings[focusedPhoto.id] ?? 0}
          colorLabel={colorLabels[focusedPhoto.id]}
          canMovePrevious={focusedIndex > 0}
          canMoveNext={focusedIndex >= 0 && focusedIndex < visibleJpgs.length - 1}
          onMove={moveFocus}
          onClose={closeFullscreenPreview}
        />
      ) : null}
    </div>
  );
}
