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
  BRIDGE_PANE_DEFAULT_WIDTH,
  bridgePaneWidthFromPointer,
  clampBridgePaneWidth,
  type BridgeResizablePane,
} from "@/lib/photo-bridge/paneLayout";
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
type FileFilter = "all" | "jpg" | "raw" | "sidecar" | "rated" | "excluded";

const EMPTY_SCAN: BridgeFolderScan = { folders: [], jpgs: [], raws: [], sidecars: [], ignoredCount: 0 };

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
  canMovePrevious,
  canMoveNext,
  onMove,
  onClose,
}: {
  photo: BridgeJpgFile;
  canMovePrevious: boolean;
  canMoveNext: boolean;
  onMove: (delta: number) => void;
  onClose: () => void;
}) {
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
    pointerIdRef.current = null;
    setDragging(false);
    storePaneWidth(pane, widthRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [pane]);

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
        applyWidth(widthFromPointer(event.clientX));
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current !== event.pointerId) return;
        applyWidth(widthFromPointer(event.clientX));
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
  const { currentLocalFolder, setCurrentLocalFolder, setSelectedJpgNames, setSelectedJpgFiles, setExecutionMode } = usePhotoStudioExecution();
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [scan, setScan] = useState<BridgeFolderScan>(EMPTY_SCAN);
  const [scanStatus, setScanStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [scanError, setScanError] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [toolKey, setToolKey] = useState<ToolKey>();
  const [sceneReviewOpen, setSceneReviewOpen] = useState(false);
  const [thumbnailSize, setThumbnailSize] = useState(156);
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [ratings, setRatings] = useState<Record<string, number>>({});
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

  const activeFolder = breadcrumbs.at(-1)?.handle ?? null;
  const folderPath = breadcrumbs.map((item) => item.name).join(" / ");
  const selectedNames = useMemo(() => scan.jpgs.filter((photo) => selectedIds.has(photo.id)).map((photo) => photo.name), [scan.jpgs, selectedIds]);
  const visibleJpgs = useMemo(() => scan.jpgs.filter((photo) => {
    if (fileFilter === "raw" || fileFilter === "sidecar") return false;
    if (fileFilter === "rated") return Boolean(ratings[photo.id]);
    if (fileFilter === "excluded") return excludedIds.has(photo.id);
    return true;
  }), [excludedIds, fileFilter, ratings, scan.jpgs]);
  const showRaws = fileFilter === "all" || fileFilter === "raw";
  const showSidecars = fileFilter === "all" || fileFilter === "sidecar";
  const focusedIndex = useMemo(() => visibleJpgs.findIndex((photo) => photo.id === focusedId), [focusedId, visibleJpgs]);
  const focusedPhoto = scan.jpgs.find((photo) => photo.id === focusedId) ?? null;
  const activeTool = TOOL_ITEMS.find((item) => item.key === toolKey);

  const updateFloatingWindowRect = useCallback((windowId: string, rect: BridgeFloatingWindowRect) => {
    floatingWindowRectsRef.current[windowId] = rect;
  }, []);

  useEffect(() => {
    setSelectedJpgNames(selectedNames);
    setSelectedJpgFiles(scan.jpgs.filter((photo) => selectedIds.has(photo.id)).map((photo) => photo.file));
  }, [scan.jpgs, selectedIds, selectedNames, setSelectedJpgFiles, setSelectedJpgNames]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setFullscreenPreviewOpen(document.fullscreenElement === rootRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!folderPath) return;
    try {
      localStorage.setItem(`olivia-bridge:marks:${folderPath}`, JSON.stringify({ ratings, excluded: [...excludedIds] }));
    } catch (error) {
      void error;
    }
  }, [excludedIds, folderPath, ratings]);

  const loadDirectory = useCallback(async (directory: FileSystemDirectoryHandle, trail: Breadcrumb[]) => {
    setScanStatus("loading");
    setScanError(undefined);
    setToolKey(undefined);
    setSceneReviewOpen(false);
    try {
      const nextPath = trail.map((item) => item.name).join(" / ");
      const next = await scanBridgeFolder(directory, nextPath);
      try {
        const parsed = JSON.parse(localStorage.getItem(`olivia-bridge:marks:${nextPath}`) ?? "{}") as { ratings?: Record<string, number>; excluded?: string[] };
        setRatings(parsed.ratings ?? {});
        setExcludedIds(new Set(parsed.excluded ?? []));
      } catch {
        setRatings({});
        setExcludedIds(new Set());
      }
      setScan(next);
      setBreadcrumbs(trail);
      setSelectedIds(new Set());
      setAnchorId(null);
      setFocusedId(next.jpgs[0]?.id ?? null);
      setPreviewSize(undefined);
      setFileFilter("all");
      setCurrentLocalFolder(directory);
      setExecutionMode("LOCAL_DIRECT");
      setScanStatus("ready");
      rootRef.current?.focus();
    } catch (error) {
      setScanStatus("error");
      setScanError(error instanceof Error ? error.message : "폴더를 읽지 못했습니다.");
    }
  }, [setCurrentLocalFolder, setExecutionMode]);

  const chooseFolder = useCallback(async () => {
    const directory = await picker.pick("readwrite");
    if (!directory) return;
    await loadDirectory(directory, [{ name: directory.name, handle: directory }]);
  }, [loadDirectory, picker]);

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
  }, [anchorId, selectedIds, visibleJpgs]);

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
  }, [focusedIndex, visibleJpgs]);

  const applyRating = useCallback((rating: number) => {
    const targets = selectedIds.size ? selectedIds : focusedId ? new Set([focusedId]) : new Set<string>();
    if (!targets.size) return;
    setRatings((previous) => {
      const next = { ...previous };
      for (const id of targets) {
        if (rating === 0) delete next[id];
        else next[id] = rating;
      }
      return next;
    });
  }, [focusedId, selectedIds]);

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
    if (document.fullscreenElement !== rootRef.current) return;
    void document.exitFullscreen().catch((error) => {
      console.warn("[olivia-bridge] 전체화면을 닫지 못했습니다.", error);
      setFullscreenPreviewOpen(document.fullscreenElement === rootRef.current);
    });
  }, []);

  const openFullscreenPreview = useCallback(() => {
    const root = rootRef.current;
    if (!focusedPhoto || !root?.requestFullscreen) return;
    setFullscreenPreviewOpen(true);
    void root.requestFullscreen().catch((error) => {
      console.warn("[olivia-bridge] 전체화면을 열지 못했습니다.", error);
      setFullscreenPreviewOpen(false);
    });
  }, [focusedPhoto]);

  const handleKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(event.target)) return;
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
      }
      return;
    }
    if (event.key === "Escape") {
      if (sceneReviewOpen) setSceneReviewOpen(false);
      else if (toolKey) setToolKey(undefined);
      return;
    }
    if (toolKey || sceneReviewOpen) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveFocus(-1); }
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveFocus(1); }
    else if (event.key === " " && isSpaceShortcutTarget(event.target, event.currentTarget)) { event.preventDefault(); openFullscreenPreview(); }
    else if (/^[0-5]$/.test(event.key)) applyRating(Number(event.key));
    else if (event.key.toLocaleLowerCase("en-US") === "x" || (event.altKey && event.key === "Delete")) { event.preventDefault(); toggleExcluded(); }
    else if (event.key === "+" || event.key === "=") setThumbnailSize((value) => Math.min(240, value + 18));
    else if (event.key === "-") setThumbnailSize((value) => Math.max(96, value - 18));
  }, [applyRating, closeFullscreenPreview, fullscreenPreviewOpen, moveFocus, openFullscreenPreview, sceneReviewOpen, toggleExcluded, toolKey]);

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

  const filters: Array<{ key: FileFilter; label: string; count: number }> = [
    { key: "all", label: "모든 파일", count: scan.jpgs.length + scan.raws.length + scan.sidecars.length },
    { key: "jpg", label: "JPG", count: scan.jpgs.length },
    { key: "raw", label: "RAW", count: scan.raws.length },
    { key: "sidecar", label: "사이드카", count: scan.sidecars.length },
    { key: "rated", label: "별점", count: Object.keys(ratings).length },
    { key: "excluded", label: "제외", count: excludedIds.size },
  ];
  const scenePhotoByName = useMemo(() => new Map(scan.jpgs.map((photo) => [photo.name, photo])), [scan.jpgs]);
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
            {filters.map((filter) => <button key={filter.key} type="button" className={fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => setFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count}</b></button>)}
          </div>
          <div className={styles.folderSummary}><span>선택 <b>{selectedIds.size}</b></span><span>별점 <b>{Object.keys(ratings).length}</b></span><span>제외 <b>{excludedIds.size}</b></span></div>
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

          {scanStatus === "idle" ? <div className={styles.emptyState}><FolderOpen size={34} /><strong>촬영 폴더를 선택해 주세요</strong><p>JPG는 썸네일로, RAW와 사이드카는 파일 정보로 표시합니다.</p><button type="button" onClick={() => void chooseFolder()}>폴더 선택</button></div> : null}
          {scanStatus === "loading" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>폴더를 읽는 중입니다</strong><p>화면에 필요한 JPG부터 썸네일을 만듭니다.</p></div> : null}
          {scanStatus === "error" ? <div className={styles.emptyState}><CircleAlert size={30} /><strong>폴더를 읽지 못했습니다</strong><p>{scanError}</p><button type="button" onClick={() => void chooseFolder()}>다른 폴더 선택</button></div> : null}
          {scanStatus === "ready" ? (
            <div className={styles.fileArea}>
              {visibleJpgs.length ? <div className={styles.thumbnailGrid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))` }}>
                {visibleJpgs.map((photo) => {
                  const selected = selectedIds.has(photo.id);
                  const focused = focusedId === photo.id;
                  const excluded = excludedIds.has(photo.id);
                  const rating = ratings[photo.id] ?? 0;
                  return <button key={photo.id} type="button" data-bridge-photo-id={photo.id} className={`${styles.thumbnailCard} ${selected ? styles.selected : ""} ${focused ? styles.focused : ""} ${excluded ? styles.excluded : ""}`} onClick={(event) => choosePhoto(photo, event)} aria-pressed={selected}><BridgeThumbnail photo={photo} alt={photo.name} /><span className={styles.photoName}>{photo.name}</span>{rating ? <span className={styles.rating}><Star size={11} fill="currentColor" />{rating}</span> : null}{excluded ? <span className={styles.rejectMark}>X</span> : null}{selected ? <span className={styles.selectMark} aria-label="선택됨" /> : null}</button>;
                })}
              </div> : null}
              {showRaws && scan.raws.length ? <section className={styles.plainFileSection}><header><strong>RAW</strong><span>미리보기 없이 형식과 파일명만 표시</span></header><div>{scan.raws.map((file) => <PlainFileCard key={file.id} file={file} />)}</div></section> : null}
              {showSidecars && scan.sidecars.length ? <section className={styles.plainFileSection}><header><strong>사이드카</strong><span>원본과 함께 유지되는 설정 파일</span></header><div>{scan.sidecars.map((file) => <PlainFileCard key={file.id} file={file} />)}</div></section> : null}
              {!visibleJpgs.length && (!showRaws || !scan.raws.length) && (!showSidecars || !scan.sidecars.length) ? <div className={styles.noPhotos}><Images size={27} /><span>이 조건에 맞는 파일이 없습니다.</span></div> : null}
            </div>
          ) : null}
          <footer className={styles.shortcutBar}><span>← → 사진 이동</span><span>Space 전체화면</span><span>⌘ 클릭 추가 선택</span><span>Shift 범위 선택</span><span>1–5 별점 · 0 해제</span><span>X 제외</span>{scan.ignoredCount ? <i>숨김·기타 {scan.ignoredCount}개 제외</i> : null}</footer>
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
        {sceneState.status === "running" ? <div className={styles.sceneProgress}><span style={{ width: `${sceneState.total ? Math.min(100, sceneState.completed / sceneState.total * 100) : 4}%` }} /></div> : null}
        {sceneState.error ? <div className={styles.sceneError}><CircleAlert size={17} /><span>{sceneState.error}</span><button type="button" onClick={() => setSceneRunKey((value) => value + 1)}><RefreshCw size={14} /> 다시 시도</button></div> : null}
        <div className={styles.sceneGrid}>{sceneState.scenes.map((scene) => { const photo = scenePhotoByName.get(scene.representativeFileName); return <article key={scene.id}>{photo ? <BridgeThumbnail photo={photo} alt={`${scene.label} 대표 사진`} eager /> : null}<div><strong>{scene.label}</strong><span>{scene.fileCount}장</span></div><small>{scene.firstFileName} – {scene.lastFileName}</small>{scene.needsReview ? <i>경계 확인 필요</i> : null}</article>; })}{sceneState.status === "complete" && !sceneState.scenes.length ? <p>표시할 Scene이 없습니다.</p> : null}</div>
        <footer><p>이 검토 단계에서는 파일을 이동하거나 이름을 바꾸지 않습니다.</p><button type="button" disabled={sceneState.status !== "complete"} onClick={() => { setSceneReviewOpen(false); setToolKey("classification"); }}><ScanSearch size={16} /> 승인하고 분류 실행</button></footer>
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
          canMovePrevious={focusedIndex > 0}
          canMoveNext={focusedIndex >= 0 && focusedIndex < visibleJpgs.length - 1}
          onMove={moveFocus}
          onClose={closeFullscreenPreview}
        />
      ) : null}
    </div>
  );
}
