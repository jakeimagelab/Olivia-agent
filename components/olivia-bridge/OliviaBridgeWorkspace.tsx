"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
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
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { BridgeFloatingWindow } from "@/components/olivia-bridge/BridgeFloatingWindow";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import {
  analyzeBridgeScenes,
  bridgeFileKind,
  rebuildBridgeSceneAnalysis,
  resolveBridgeToolSelection,
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
import { loadRemoteBridgeRatings } from "@/lib/photo-bridge/remoteRatings";
import { loadRemoteBridgeThumbnails } from "@/lib/photo-bridge/remoteThumbnails";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import {
  bridgeGridNavigationTarget,
  type BridgeGridDirection,
} from "@/lib/photo-bridge/gridNavigation";
import {
  bridgeKeyboardRangeSelection,
  bridgeReviewDeckWindow,
  bridgeReviewLayout,
  cycleBridgeReviewIndex,
  removeBridgeReviewItem,
  restoreBridgeReviewItem,
  type BridgeReviewRemovedItem,
} from "@/lib/photo-bridge/reviewMode";
import { mergePhotoToolSelectionSources, normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";
import { matchPersonSelectFileNames, type PersonSelectImportMatch } from "@/lib/photo-bridge/personSelectImport";
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
  resolveBridgeFolderTrail,
  saveBridgeFolderTrail,
} from "@/lib/photo-bridge/recentFolder";
import {
  BRIDGE_COLOR_LABELS,
  bridgeLabelFilterCommandFromShortcutCode,
  bridgeLabelFilterName,
  matchesBridgeSelectionView,
  matchesBridgeLabelFilter,
  normalizeBridgeColorLabels,
  normalizeBridgeRatingEdits,
  resolveBridgeRatings,
  toggleBridgeColorLabel,
  updateBridgeRatingEdits,
  type BridgeColorLabel,
  type BridgeColorLabels,
  type BridgeLabelFilter,
  type BridgeLabelFilterCommand,
  type BridgeRatingEdits,
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
type PreviewTab = "selection" | "preview" | "olivia";
type PersonSelectEventSummary = {
  id: string;
  title: string;
  people_count: number;
  submitted_count: number;
};
type PersonSelectImportResult = PersonSelectImportMatch & { eventTitle: string };
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

function BridgeSelectionReview({
  photos,
  activeId,
  rating,
  colorLabel,
  excluded,
  removedCount,
  onFocus,
  onMove,
  onRemove,
  onRestore,
  onOpenFullscreen,
  onClose,
}: {
  photos: BridgeJpgFile[];
  activeId: string | null;
  rating: number;
  colorLabel?: BridgeColorLabel;
  excluded: boolean;
  removedCount: number;
  onFocus: (id: string) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onRestore: () => void;
  onOpenFullscreen: () => void;
  onClose: () => void;
}) {
  const layout = bridgeReviewLayout(photos.length);
  const activeIndex = Math.max(0, photos.findIndex((photo) => photo.id === activeId));
  const activePhoto = photos[activeIndex] ?? null;
  const color = colorLabel ? BRIDGE_COLOR_LABELS[colorLabel] : null;
  const deck = bridgeReviewDeckWindow(photos, activePhoto ? activeIndex : -1);

  const photoCard = (photo: BridgeJpgFile, active: boolean) => (
    <button key={photo.id} type="button" className={styles.reviewPhotoCard} data-active={active ? "true" : "false"} onClick={() => onFocus(photo.id)} aria-label={`${photo.name}${active ? ", 현재 사진" : ""}`}>
      <BridgePreviewImage photo={photo} />
      <span><strong>{photo.name}</strong>{active ? <small>현재 사진</small> : null}</span>
    </button>
  );

  return (
    <section className={styles.selectionReview} role="dialog" aria-modal="true" aria-label="선택 사진 리뷰">
      <header className={styles.reviewHeader}>
        <div><strong>선택 사진 리뷰</strong><span>{photos.length.toLocaleString("ko-KR")}장 · {layout === "deck" ? "로테이션" : layout === "grid" ? "비교 보기" : "한 장 보기"}</span></div>
        <button type="button" onClick={onClose} aria-label="리뷰 나가기"><X size={22} /></button>
      </header>
      <div className={styles.reviewStage} data-layout={layout}>
        {!photos.length ? <div className={styles.reviewEmpty}><Images size={34} /><strong>모든 사진을 선택 해제했습니다.</strong><span>↑ 키로 마지막 사진을 다시 선택할 수 있어요.</span></div> : null}
        {layout === "single" && activePhoto ? photoCard(activePhoto, true) : null}
        {layout === "grid" ? <div className={styles.reviewGrid}>{photos.map((photo) => photoCard(photo, photo.id === activePhoto?.id))}</div> : null}
        {layout === "deck" ? <div className={styles.reviewDeck}>{deck.map(({ item, offset }) => {
          const active = offset === 0;
          return <button key={item.id} type="button" className={styles.reviewDeckCard} data-offset={offset} data-active={active ? "true" : "false"} onClick={() => onFocus(item.id)} aria-label={`${item.name}${active ? ", 현재 사진" : ""}`}>{active ? <BridgePreviewImage photo={item} /> : <BridgeThumbnail photo={item} alt={item.name} eager />}<span>{item.name}</span></button>;
        })}</div> : null}
      </div>
      <footer className={styles.reviewFooter}>
        <div className={styles.reviewCurrent}><strong>{activePhoto?.name ?? "선택 사진 없음"}</strong><span>{activePhoto ? `${activeIndex + 1} / ${photos.length}` : "↑ 복원 가능"}</span>{rating ? <b><Star size={12} fill="currentColor" /> {rating}</b> : null}{color ? <b><i style={{ background: color.color }} />{color.name}</b> : null}{excluded ? <b className={styles.reviewExcluded}>X 제외</b> : null}</div>
        <div className={styles.reviewControls}>
          <button type="button" disabled={!photos.length} onClick={() => onMove(-1)} aria-label="이전 사진"><ChevronLeft size={18} /></button>
          <button type="button" disabled={!photos.length} onClick={onRemove}><ArrowDown size={17} /> 선택 해제</button>
          <button type="button" disabled={!removedCount} onClick={onRestore}><ArrowUp size={17} /> 다시 선택</button>
          <button type="button" disabled={!activePhoto} onClick={onOpenFullscreen}><Maximize2 size={16} /> 크게 보기</button>
          <button type="button" disabled={!photos.length} onClick={() => onMove(1)} aria-label="다음 사진"><ChevronRight size={18} /></button>
        </div>
        <p>←→ 이동 · ↓ 해제 · ↑ 복원 · Space 크게 보기 · 1–5 별점 · 0 해제 · 6–9 컬러 · X 제외 · ESC 나가기</p>
      </footer>
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
  const [, setScanError] = useState<string>();
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
  const [selectionReviewOpen, setSelectionReviewOpen] = useState(false);
  const [reviewActiveId, setReviewActiveId] = useState<string | null>(null);
  const [reviewRemoved, setReviewRemoved] = useState<ReviewRemovedSource[]>([]);
  const [thumbnailSize, setThumbnailSize] = useState(THUMBNAIL_SIZE_DEFAULT);
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [labelFilter, setLabelFilter] = useState<BridgeLabelFilter | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [adobeRatings, setAdobeRatings] = useState<Record<string, number>>({});
  const [ratingEdits, setRatingEdits] = useState<BridgeRatingEdits>({});
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
  const [personSelectDialogOpen, setPersonSelectDialogOpen] = useState(false);
  const [personSelectEvents, setPersonSelectEvents] = useState<PersonSelectEventSummary[]>([]);
  const [personSelectEventsLoading, setPersonSelectEventsLoading] = useState(false);
  const [personSelectImportingId, setPersonSelectImportingId] = useState("");
  const [personSelectError, setPersonSelectError] = useState("");
  const [personSelectResult, setPersonSelectResult] = useState<PersonSelectImportResult | null>(null);
  const [rawRootPromptOpen, setRawRootPromptOpen] = useState(false);
  const [rawRootPromptMessage, setRawRootPromptMessage] = useState("");
  const [folderImageCounts, setFolderImageCounts] = useState<Record<string, number>>({});
  const [previewTab, setPreviewTab] = useState<PreviewTab>("selection");
  const [compactPreviewOpen, setCompactPreviewOpen] = useState(false);
  const [compactFiltersOpen, setCompactFiltersOpen] = useState(false);
  const [focusedPlainId, setFocusedPlainId] = useState<string | null>(null);
  const floatingWindowRectsRef = useRef<Record<string, BridgeFloatingWindowRect>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const folderPanelRef = useRef<HTMLElement>(null);
  const compactFilterButtonRef = useRef<HTMLButtonElement>(null);
  const previewPanelRef = useRef<HTMLElement>(null);
  const fileAreaRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeSessionRef = useRef<MarqueeSession | null>(null);
  const marqueeFrameRef = useRef<number | null>(null);
  const suppressThumbnailClickRef = useRef(false);
  const restoreAttemptedRef = useRef(false);
  const remoteLoadGenerationRef = useRef(0);
  const ratingsRef = useRef(ratings);
  const ratingEditsRef = useRef(ratingEdits);

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
  const effectiveRatings = useMemo(
    () => resolveBridgeRatings(ratings, adobeRatings, ratingEdits),
    [adobeRatings, ratingEdits, ratings],
  );
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
  const reviewPhotos = useMemo(() => scan.jpgs.filter((photo) => selectedIds.has(photo.id)), [scan.jpgs, selectedIds]);
  const resolvedReviewActiveId = reviewActiveId && reviewPhotos.some((photo) => photo.id === reviewActiveId)
    ? reviewActiveId
    : reviewPhotos[0]?.id ?? null;
  const reviewActiveIndex = reviewPhotos.findIndex((photo) => photo.id === resolvedReviewActiveId);
  const reviewActivePhoto = reviewPhotos[reviewActiveIndex] ?? null;
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

  useEffect(() => { ratingsRef.current = ratings; }, [ratings]);
  useEffect(() => { ratingEditsRef.current = ratingEdits; }, [ratingEdits]);

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
      const next = await scanBridgeFolder(directory, nextPath, {
        includeNestedJpgs: nestedJpgs,
        maxDepth: 5,
      });
      let restoredRatings: Record<string, number> = {};
      try {
        const parsed = JSON.parse(localStorage.getItem(`olivia-bridge:marks:${nextPath}`) ?? "{}") as { ratings?: Record<string, number>; ratingEdits?: unknown; colorLabels?: unknown; excluded?: string[] };
        restoredRatings = parsed.ratings ?? {};
        setRatings(restoredRatings);
        setRatingEdits(normalizeBridgeRatingEdits(parsed.ratingEdits));
        setColorLabels(normalizeBridgeColorLabels(parsed.colorLabels));
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
      console.error("[olivia-bridge] Failed to read local folder", error);
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
    const root = await picker.pick("readwrite");
    if (!root) return;
    try {
      const trail = await resolveBridgeFolderTrail(root, activeFolder);
      if (!trail) {
        setRawRootPromptMessage("현재 사진 폴더를 포함하는 촬영 상위 폴더를 선택해 주세요.");
        return;
      }
      const current = trail.at(-1)?.handle ?? activeFolder;
      setBreadcrumbs(trail);
      setCurrentLocalFolder(current);
      setRawMatchDefaultFolder(bridgeRawMatchDefaultFolder(trail));
      setRawMatchFolderCandidates(bridgeRawMatchFolderCandidates(trail));
      setRawRootPromptOpen(false);
      setRawRootPromptMessage("");
      setToolKey("raw-match");
      void saveBridgeFolderTrail(trail).catch((error) => {
        console.error("[olivia-bridge] Failed to remember the RAW search root", error);
      });
    } catch (error) {
      setRawRootPromptMessage(error instanceof Error ? error.message : "촬영 상위 폴더를 확인하지 못했습니다.");
    }
  }, [activeFolder, picker, setCurrentLocalFolder, setRawMatchDefaultFolder, setRawMatchFolderCandidates]);

  const openRawMatchWithCurrentScope = useCallback(() => {
    setRawRootPromptOpen(false);
    setRawRootPromptMessage("");
    setToolKey("raw-match");
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
    setRatings({});
    setAdobeRatings({});
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
      }));
      setScan({ ...EMPTY_SCAN, jpgs });
      setFocusedId(jpgs[0]?.id ?? null);
      setScanStatus("ready");
      rootRef.current?.focus();
    } catch (error) {
      if (generation !== remoteLoadGenerationRef.current) return;
      console.error("[olivia-bridge] Failed to read remote folder", error);
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
    if (!scan.jpgs.length || (!activeFolder && !remoteFolder)) {
      setAdobeRatings({});
      commitSelectedIds(manualSelectedIdsRef.current, new Set());
      setAdobeSelectionLoading(false);
      return;
    }

    // 원격(NAS)은 브라우저가 파일을 못 여니 맥스튜디오 워커가 XMP 별점을 읽어서 넘긴다.
    if (!activeFolder && remoteFolder) {
      setAdobeSelectionLoading(true);
      try {
        const remote = await loadRemoteBridgeRatings(remoteFolder.path, { signal });
        if (signal?.aborted || generation !== adobeSelectionGenerationRef.current) return;
        const byKey = new Map(remote.ratings.map((item) => [item.key, item.rating]));
        const nextRatings: Record<string, number> = {};
        const nextAdobeIds = new Set<string>();
        for (const photo of scan.jpgs) {
          const rating = byKey.get(normalizePhotoToolFileKey(photo.name));
          if (!rating) continue;
          nextRatings[photo.id] = rating;
          nextAdobeIds.add(photo.id);
        }
        setAdobeRatings(nextRatings);
        const nextEffective = resolveBridgeRatings(ratingsRef.current, nextRatings, ratingEditsRef.current);
        const sharedRatings = Object.fromEntries(scan.jpgs.map((photo) => [photo.name, nextEffective[photo.id] ?? 0]));
        setJpgRatingsByName(sharedRatings, { overwrite: true });
        commitSelectedIds(manualSelectedIdsRef.current, nextAdobeIds);
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        console.error("[olivia-bridge] Failed to sync remote Adobe Bridge ratings", error);
      } finally {
        if (generation === adobeSelectionGenerationRef.current) setAdobeSelectionLoading(false);
      }
      return;
    }

    setAdobeSelectionLoading(true);
    try {
      const localPhotos = scan.jpgs
        .filter((photo) => Boolean(photo.handle || photo.file))
        .map((photo) => ({
          name: photo.name,
          file: photo.file,
          handle: photo.handle,
          relativeDirectory: photo.relativeDirectory,
        }));
      const found = await collectAdobeBridgeRatings(activeFolder!, localPhotos, { signal });
      if (signal?.aborted || generation !== adobeSelectionGenerationRef.current) return;
      const nextRatings: Record<string, number> = {};
      const nextAdobeIds = new Set<string>();
      // 파일명 기준 공용 저장소에도 넣는다. 손으로 준 별점은 applyRating이 넣고 있는데
      // 어도비에서 읽어온 별점만 빠져 있어서, RAW 매칭·사진 셀렉이 그 별점을 못 받았다.
      for (const photo of scan.jpgs) {
        const rating = found.get(normalizePhotoToolFileKey(photo.name));
        if (!rating) continue;
        nextRatings[photo.id] = rating;
        nextAdobeIds.add(photo.id);
      }
      setAdobeRatings(nextRatings);
      // Adobe 원본값보다 앱에서 명시적으로 편집한 값(0점 해제 포함)을 우선해 공유한다.
      const nextEffective = resolveBridgeRatings(ratingsRef.current, nextRatings, ratingEditsRef.current);
      const sharedRatings = Object.fromEntries(scan.jpgs.map((photo) => [photo.name, nextEffective[photo.id] ?? 0]));
      setJpgRatingsByName(sharedRatings, { overwrite: true });
      commitSelectedIds(manualSelectedIdsRef.current, nextAdobeIds);
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      console.error("[olivia-bridge] Failed to sync Adobe Bridge ratings", error);
    } finally {
      if (generation === adobeSelectionGenerationRef.current) setAdobeSelectionLoading(false);
    }
  }, [activeFolder, commitSelectedIds, remoteFolder, scan.jpgs, setJpgRatingsByName]);

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
    setAnchorId(photo.id);
    setFocusedId(photo.id);
    setFocusedPlainId(null);
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
    const result = removeBridgeReviewItem(reviewPhotos.map((photo) => photo.id), activeId);
    const removed = result.removed;
    if (!removed) return;
    const manual = new Set(manualSelectedIdsRef.current);
    const adobe = new Set(adobeSelectedIdsRef.current);
    const wasManual = manual.delete(activeId);
    const wasAdobe = adobe.delete(activeId);
    commitSelectedIds(manual, adobe);
    setReviewRemoved((current) => [...current, { ...removed, wasManual, wasAdobe }]);
    setReviewActiveId(result.nextActiveId);
    setFocusedId(result.nextActiveId);
  }, [commitSelectedIds, resolvedReviewActiveId, reviewPhotos]);

  const restoreReviewPhoto = useCallback(() => {
    const removed = reviewRemoved.at(-1);
    if (!removed) return;
    const restored = restoreBridgeReviewItem(reviewPhotos.map((photo) => photo.id), removed);
    const manual = new Set(manualSelectedIdsRef.current);
    const adobe = new Set(adobeSelectedIdsRef.current);
    if (removed.wasManual || !removed.wasAdobe) manual.add(removed.id);
    if (removed.wasAdobe) adobe.add(removed.id);
    commitSelectedIds(manual, adobe);
    setReviewRemoved((current) => current.slice(0, -1));
    if (restored.activeId) focusReviewPhoto(restored.activeId);
  }, [commitSelectedIds, focusReviewPhoto, reviewPhotos, reviewRemoved]);

  const labelTargets = useCallback((focusedOnly = false) => {
    if (focusedOnly) return focusedId ? new Set([focusedId]) : new Set<string>();
    return selectedIds.size ? selectedIds : focusedId ? new Set([focusedId]) : new Set<string>();
  }, [focusedId, selectedIds]);

  const applyRating = useCallback((rating: number, focusedOnly = false) => {
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
  }, [labelTargets, scan.jpgs, setJpgRatingsByName]);

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
    if (event.key === "Escape" && (folderSourceOpen || nasPickerOpen || personSelectDialogOpen || rawRootPromptOpen)) {
      event.preventDefault();
      setFolderSourceOpen(false);
      setNasPickerOpen(false);
      setPersonSelectDialogOpen(false);
      setRawRootPromptOpen(false);
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
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === "KeyB") {
      event.preventDefault();
      if (!toolKey && !sceneReviewOpen && !selectionReviewOpen) openSelectionReview();
      return;
    }
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
  }, [applyColorLabel, applyLabelFilterCommand, applyRating, closeCompactFilters, closeFullscreenPreview, closeSelectionReview, compactFiltersOpen, folderSourceOpen, fullscreenPreviewOpen, moveFullscreenPreview, moveGridFocus, moveReview, nasPickerOpen, openFullscreenPreview, openSelectionReview, personSelectDialogOpen, rawRootPromptOpen, removeReviewPhoto, resizeThumbnails, restoreReviewPhoto, sceneReviewOpen, selectAllVisibleJpgs, selectionReviewOpen, toggleExcluded, toolKey]);

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
      setRawRootPromptMessage("");
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
    const hasStar = matchesBridgeSelectionView(photo.id, "starred", effectiveRatings, colorLabels);
    const hasColor = matchesBridgeSelectionView(photo.id, "colored", effectiveRatings, colorLabels);
    if (hasStar) counts.starred += 1;
    if (hasColor) counts.colored += 1;
    if (hasStar || hasColor) counts.selected += 1;
    else counts.unselected += 1;
    return counts;
  }, { starred: 0, colored: 0, selected: 0, unselected: 0 }), [colorLabels, effectiveRatings, scan.jpgs]);
  const labeledCount = selectionCounts.selected;
  const selectedPhotos = useMemo(() => scan.jpgs.filter((photo) => selectedIds.has(photo.id)), [scan.jpgs, selectedIds]);
  const fullscreenPhoto = selectionReviewOpen ? reviewActivePhoto : focusedPhoto;
  const fullscreenIndex = selectionReviewOpen ? reviewActiveIndex : focusedIndex;
  const fullscreenTotal = selectionReviewOpen ? reviewPhotos.length : visibleJpgs.length;
  const adobeSelectedCount = selectedPhotos.reduce((count, photo) => count + (adobeSelectedIdsRef.current.has(photo.id) ? 1 : 0), 0);
  const manualSelectedCount = selectedPhotos.length - adobeSelectedCount;
  const selectedRatingValues = selectedPhotos.map((photo) => effectiveRatings[photo.id] ?? 0);
  const selectedColorValues = selectedPhotos.map((photo) => colorLabels[photo.id] ?? 0);
  const commonSelectedRating = selectedRatingValues.length && selectedRatingValues.every((rating) => rating === selectedRatingValues[0]) ? selectedRatingValues[0] : null;
  const commonSelectedColor = selectedColorValues.length && selectedColorValues.every((label) => label === selectedColorValues[0]) ? selectedColorValues[0] : null;
  const selectedRatingMixed = selectedRatingValues.length > 1 && commonSelectedRating === null;
  const selectedColorMixed = selectedColorValues.length > 1 && commonSelectedColor === null;
  const allSelectedExcluded = selectedPhotos.length > 0 && selectedPhotos.every((photo) => excludedIds.has(photo.id));
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
        <div className={styles.breadcrumbs} aria-label="현재 폴더 경로">
          {remoteFolder ? <span>NAS · {remoteFolder.displayPath}</span> : breadcrumbs.length ? breadcrumbs.map((item, index) => (
            <span key={`${item.name}-${index}`}>{index ? <ChevronRight size={12} /> : null}<button type="button" onClick={() => void loadDirectory(item.handle, breadcrumbs.slice(0, index + 1))}>{item.name}</button></span>
          )) : <span>작업할 촬영 폴더를 선택해 주세요.</span>}
        </div>
        <label className={styles.nestedJpgPathToggle}><input type="checkbox" checked={includeNestedJpgs} disabled={!activeFolder || scanStatus === "loading"} onChange={(event) => changeNestedJpgVisibility(event.currentTarget.checked)} /><span>하위 폴더 JPG 포함</span></label>
        <span className={styles.fileCountSummary}>보이는 중 {centerFileCount.toLocaleString("ko-KR")} · 전체 {(scan.jpgs.length + scan.raws.length + scan.sidecars.length).toLocaleString("ko-KR")}장</span>
        <button ref={compactFilterButtonRef} type="button" className={styles.compactFilterEntry} aria-expanded={compactFiltersOpen} aria-controls="olivia-bridge-folder-panel" onClick={() => setCompactFiltersOpen(true)}><SlidersHorizontal size={14} /> 필터</button>
        <button type="button" className={styles.compactInspectorEntry} onClick={() => { setPreviewTab("selection"); setCompactPreviewOpen(true); }}><Check size={14} /> 선택한 파일</button>
      </div>

      <main ref={workspaceRef} className={styles.workspace} data-compact-preview={compactPreviewOpen ? "true" : "false"}>
        {compactFiltersOpen ? <button type="button" className={styles.compactFilterBackdrop} aria-label="필터 닫기" onClick={closeCompactFilters} /> : null}
        <aside ref={folderPanelRef} id="olivia-bridge-folder-panel" className={styles.folderPanel} data-compact-open={compactFiltersOpen ? "true" : "false"} tabIndex={-1} aria-label="폴더와 파일 필터">
          <div className={styles.panelTitle}><span>폴더와 필터</span><button type="button" className={styles.compactFilterClose} onClick={closeCompactFilters} aria-label="필터 닫기"><X size={15} /></button></div>
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
            {fileFilters.map((filter) => <button key={filter.key} type="button" data-zero={filter.count === 0 ? "true" : undefined} className={!labelFilter && fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => chooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count.toLocaleString("ko-KR")}</b></button>)}
            <small>셀렉 보기</small>
            {selectionFilters.map((filter) => <button key={filter.key} type="button" data-zero={filter.count === 0 ? "true" : undefined} className={!labelFilter && fileFilter === filter.key ? styles.activeFilter : ""} onClick={() => chooseFileFilter(filter.key)}><span>{filter.label}</span><b>{filter.count.toLocaleString("ko-KR")}</b></button>)}
          </div>
          <div className={styles.folderList}>
            {scan.folders.length ? <small>하위 폴더</small> : null}
            {scan.folders.map((folder) => <button key={folder.name} type="button" onClick={() => void loadDirectory(folder, [...breadcrumbs, { name: folder.name, handle: folder }])}><Folder size={15} /><span>{folder.name}</span><b>{(folderImageCounts[folder.name.normalize("NFC")] ?? 0).toLocaleString("ko-KR")}</b><ChevronRight size={12} /></button>)}
            {activeFolder && !scan.folders.length ? <p>하위 폴더가 없습니다.</p> : null}
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
            <div><strong>{activeFolder?.name ?? "폴더 내용"}</strong><span>{centerFileCount.toLocaleString("ko-KR")}개의 파일{scan.nestedJpgCount ? ` · 하위 JPG ${scan.nestedJpgCount.toLocaleString("ko-KR")}장` : ""}</span></div>
            <div className={styles.browserActions}>
              <button type="button" className={styles.compactPreviewButton} onClick={() => setCompactPreviewOpen(true)} aria-label="미리보기 열기"><Maximize2 size={15} /> 미리보기</button>
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
                  const focused = focusedId === photo.id;
                  const adobeSelected = selected && adobeSelectedIdsRef.current.has(photo.id);
                  const manualSelected = selected && !adobeSelected;
                  const excluded = excludedIds.has(photo.id);
                  const rating = effectiveRatings[photo.id] ?? 0;
                  const colorLabel = colorLabels[photo.id];
                  const color = colorLabel ? BRIDGE_COLOR_LABELS[colorLabel] : null;
                  return <button key={photo.id} type="button" data-bridge-photo-id={photo.id} data-nested={photo.relativeDirectory ? "true" : "false"} data-selection-source={adobeSelected ? "adobe" : manualSelected ? "manual" : "none"} className={`${styles.thumbnailCard} ${selected ? styles.selected : ""} ${adobeSelected ? styles.adobeSelected : ""} ${manualSelected ? styles.manualSelected : ""} ${focused ? styles.focused : ""} ${excluded ? styles.excluded : ""}`} onClick={(event) => { if (isMacControlClick(event)) return; choosePhoto(photo, event); }} onContextMenu={(event) => { if (!isMacControlClick(event)) return; event.preventDefault(); choosePhoto(photo, event); }} aria-label={`${photo.name}${adobeSelected ? ", Adobe 선택" : manualSelected ? ", 직접 선택" : ""}${focused ? ", 현재 포커스" : ""}`} aria-pressed={selected}><BridgeThumbnail photo={photo} alt={photo.name} />{adobeSelected ? <span className={styles.sourceBadge}>Adobe</span> : null}<span className={styles.photoName}>{photo.name}</span>{photo.relativeDirectory ? <span className={styles.photoPath}>{photo.relativeDirectory}</span> : null}{rating ? <span className={styles.rating}><Star size={11} fill="currentColor" />{rating}</span> : null}{color ? <span className={styles.colorLabelMark} style={{ background: color.color }} aria-label={`${color.name} 컬러 레이블`} /> : null}{excluded ? <span className={styles.rejectMark}>X</span> : null}</button>;
                })}
              </div> : null}
              {showRaws && scan.raws.length ? <section className={styles.plainFileSection}><header><strong>RAW</strong><span>미리보기 없이 형식과 파일명만 표시</span></header><div>{scan.raws.map((file) => <PlainFileCard key={file.id} file={file} active={focusedPlainFile?.id === file.id} onClick={() => { setFocusedPlainId(file.id); setFocusedId(null); }} />)}</div></section> : null}
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
                <p>마지막으로 고른 것 · {focusedPhoto?.name ?? focusedPlainFile?.name ?? "없음"}</p>
                <div className={styles.selectionSourceCounts}><span>Adobe {adobeSelectedCount}장</span><span>직접 고름 {manualSelectedCount}장</span></div>
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
          ) : focusedPhoto ? <><div className={styles.previewCanvas} onDoubleClick={openFullscreenPreview}><button type="button" className={`${styles.previewArrow} ${styles.previewArrowLeft}`} onClick={() => moveFocus(-1)} disabled={focusedIndex <= 0} aria-label="이전 사진"><ChevronLeft size={22} /></button><BridgePreviewImage photo={focusedPhoto} onSize={setPreviewSize} /><button type="button" className={`${styles.previewArrow} ${styles.previewArrowRight}`} onClick={() => moveFocus(1)} disabled={focusedIndex < 0 || focusedIndex >= visibleJpgs.length - 1} aria-label="다음 사진"><ChevronRight size={22} /></button></div><div className={styles.previewMeta}><strong>{focusedPhoto.name}</strong><span>{previewSize ? `${previewSize.width} × ${previewSize.height}` : "크기 확인 중"}</span><i /><span>{formatBytes(focusedPhoto.size)}</span><i /><span>{focusedPhoto.extension}</span><div className={styles.previewRatings} aria-label="별점">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${rating}점`} aria-pressed={(effectiveRatings[focusedPhoto.id] ?? 0) >= rating} onClick={() => applyRating(rating, true)}><Star size={15} fill={(effectiveRatings[focusedPhoto.id] ?? 0) >= rating ? "currentColor" : "none"} /></button>)}<button type="button" onClick={() => applyRating(0, true)}>해제</button></div><button type="button" className={styles.previewSelectButton} onClick={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(focusedPhoto.id)) next.delete(focusedPhoto.id); else next.add(focusedPhoto.id); return next; })}><Check size={13} />{selectedIds.has(focusedPhoto.id) ? "선택됨" : "선택"}</button><button type="button" className={styles.previewExpandButton} onClick={openFullscreenPreview}><Maximize2 size={13} /> 크게 보기</button></div></> : focusedPlainFile ? <div className={styles.previewFileInfo}><File size={42} /><strong>{focusedPlainFile.name}</strong><span>{focusedPlainFile.extension} · {formatBytes(focusedPlainFile.size)}</span><p>RAW와 사이드카는 파일 정보만 표시하며 미리보기를 만들지 않습니다.</p></div> : <div className={styles.previewEmpty}><Images size={34} /><strong>미리 볼 파일을 선택해 주세요</strong><span>RAW와 사이드카는 미리보기를 만들지 않습니다.</span></div>}
        </aside>
      </main>

      <section className={styles.actionBar} aria-label="Bridge 작업 도구">
        <div className={styles.actionSummary}><span>선택 <b>{selectedIds.size}</b></span><span>레이블 <b>{labeledCount}</b></span><span>제외 <b>{excludedIds.size}</b></span></div>
        <nav className={styles.actionTools}>
          {TOOL_ITEMS.map(({ key, label, icon: Icon }) => {
            const disabledReason = toolDisabledReason(key);
            return <button key={key} type="button" data-primary={key === "classification" ? "true" : "false"} data-active={toolKey === key || (key === "classification" && sceneReviewOpen) ? "true" : "false"} onClick={() => openTool(key)} disabled={Boolean(disabledReason)} aria-label={disabledReason ? `${label}: ${disabledReason}` : label} title={disabledReason ?? label}><Icon size={12} strokeWidth={1.8} /><span>{label}</span>{disabledReason ? <small>{disabledReason}</small> : null}</button>;
          })}
          <button type="button" className={styles.customerSelectionButton} onClick={openPersonSelectImport} disabled={!hasActiveFolder || scanStatus !== "ready"} aria-label={!hasActiveFolder || scanStatus !== "ready" ? "고객 선택 불러오기: 사진 폴더를 먼저 선택해 주세요." : "고객 선택 불러오기"} title={!hasActiveFolder || scanStatus !== "ready" ? "사진 폴더를 먼저 선택해 주세요." : "개인별 사진 셀렉에서 고객이 고른 사진을 불러옵니다."}><Users size={12} strokeWidth={1.8} /><span>고객 선택 불러오기</span></button>
        </nav>
      </section>

      <footer className={styles.shortcutBar}>
        <div className={styles.shortcutHints}>{activeLabelFilterName ? <b className={styles.shortcutActiveFilter}>필터: {activeLabelFilterName}</b> : null}<span>드래그 영역 선택</span><span>⌘/Ctrl 클릭 추가 선택</span><span>Shift+←↑↓→ 범위 선택</span><span>⌘/Ctrl+A 전체 선택</span><span>⌘/Ctrl+B 선택 리뷰</span><span>← ↑ ↓ → 사진 이동</span><span>Space OS 창 미리보기</span><span>1–5 별점 · 0 해제</span><span>6–9 컬러 · 같은 키 해제</span><span>⌥⌘1–5 별점만 · ⌥⌘6–9 컬러만 · ⌥⌘A 전체</span><span>X 제외</span>{scan.unreadableFolderCount ? <i>하위 폴더 {scan.unreadableFolderCount}곳을 읽지 못함</i> : null}{scan.ignoredCount ? <i>숨김·기타 {scan.ignoredCount}개 제외</i> : null}</div>
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
        colorLabel={reviewActivePhoto ? colorLabels[reviewActivePhoto.id] : undefined}
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
          colorLabel={colorLabels[fullscreenPhoto.id]}
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

      {personSelectDialogOpen ? (
        <div className={`${styles.folderSourceOverlay} ${styles.customerSelectionOverlay}`} onClick={closePersonSelectImport}>
          <section className={`${styles.folderSourceChooser} ${styles.customerSelectionChooser}`} role="dialog" aria-modal="true" aria-labelledby="bridge-person-select-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><strong id="bridge-person-select-title">고객 선택 불러오기</strong><span>개인별 사진 셀렉 행사를 고르면 현재 폴더에서 같은 파일명을 찾습니다.</span></div>
              <button type="button" onClick={closePersonSelectImport} aria-label="고객 선택 불러오기 닫기"><X size={18} /></button>
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
              <div><strong id="bridge-raw-root-title">RAW 검색 기준 폴더</strong><span>{rawRootPromptMessage || "상위 2단계를 확인하려면 촬영 상위 폴더 접근이 필요합니다."}</span></div>
              <button type="button" onClick={() => setRawRootPromptOpen(false)} aria-label="RAW 검색 기준 폴더 닫기"><X size={18} /></button>
            </header>
            <div>
              <button type="button" onClick={() => void pickRawSearchRoot()}><FolderOpen size={19} /><span><strong>촬영 상위 폴더 선택</strong><small>JPG전체와 RAW 사진 폴더를 함께 담은 폴더를 선택하세요.</small></span></button>
              <button type="button" onClick={openRawMatchWithCurrentScope}><ScanSearch size={19} /><span><strong>현재 폴더만 검색</strong><small>현재 폴더와 이미 허용된 경로만 확인합니다.</small></span></button>
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
