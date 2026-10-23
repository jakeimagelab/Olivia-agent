"use client";

import dynamic from "next/dynamic";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  LoaderCircle,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import {
  analyzeBridgeScenes,
  scanBridgeFolder,
  updateBridgeSelection,
  type BridgeFolderScan,
  type BridgeJpgFile,
  type BridgeScene,
} from "@/lib/photo-bridge/bridgeFiles";
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

const EMPTY_SCAN: BridgeFolderScan = { folders: [], jpgs: [], raws: [], ignoredCount: 0 };

const TOOL_ITEMS: Array<{
  key: ToolKey;
  label: string;
  mode: PhotoWorkspaceMode;
  selectMode?: PhotoSelectMode;
  fileOpsMode?: PhotoFileOpsMode;
}> = [
  { key: "jpg-prep", label: "JPG 정리", mode: "jpg-prep" },
  { key: "select", label: "사진 셀렉", mode: "select", selectMode: "manual" },
  { key: "raw-match", label: "RAW 매칭", mode: "raw-match" },
  { key: "classification", label: "사진 분류", mode: "classification" },
  { key: "tcut", label: "T컷 정리", mode: "select", selectMode: "tcut" },
  { key: "resize", label: "리사이즈", mode: "file-ops", fileOpsMode: "resize" },
  { key: "rename", label: "이름변경", mode: "file-ops", fileOpsMode: "rename" },
  { key: "retouch", label: "사진 보정", mode: "retouch" },
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

function BridgePreviewImage({ photo }: { photo: BridgeJpgFile }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const next = URL.createObjectURL(photo.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);
  return url ? <img src={url} alt={photo.name} draggable={false} decoding="async" /> : <LoaderCircle className={styles.spin} size={24} />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

export default function OliviaBridgeWorkspace() {
  const picker = usePhotoFolderPicker();
  const {
    currentLocalFolder,
    setCurrentLocalFolder,
    setSelectedJpgNames,
    setSelectedJpgFiles,
    setExecutionMode,
  } = usePhotoStudioExecution();
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [scan, setScan] = useState<BridgeFolderScan>(EMPTY_SCAN);
  const [scanStatus, setScanStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [scanError, setScanError] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toolKey, setToolKey] = useState<ToolKey>();
  const [thumbnailSize, setThumbnailSize] = useState(154);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [sceneState, setSceneState] = useState<SceneState>({ status: "idle", stage: "폴더를 선택해 주세요", completed: 0, total: 0, scenes: [] });
  const [sceneRunKey, setSceneRunKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeFolder = breadcrumbs.at(-1)?.handle ?? null;
  const folderPath = breadcrumbs.map((item) => item.name).join(" / ");
  const selectedNames = useMemo(() => scan.jpgs.filter((photo) => selectedIds.has(photo.id)).map((photo) => photo.name), [scan.jpgs, selectedIds]);
  const focusedIndex = useMemo(() => scan.jpgs.findIndex((photo) => photo.id === focusedId), [focusedId, scan.jpgs]);
  const focusedPhoto = focusedIndex >= 0 ? scan.jpgs[focusedIndex] : null;
  const activeTool = TOOL_ITEMS.find((item) => item.key === toolKey);

  useEffect(() => {
    setSelectedJpgNames(selectedNames);
    setSelectedJpgFiles(scan.jpgs.filter((photo) => selectedIds.has(photo.id)).map((photo) => photo.file));
  }, [scan.jpgs, selectedIds, selectedNames, setSelectedJpgFiles, setSelectedJpgNames]);

  useEffect(() => {
    if (!folderPath) return;
    const key = `olivia-bridge:marks:${folderPath}`;
    try {
      localStorage.setItem(key, JSON.stringify({ ratings, excluded: [...excludedIds] }));
    } catch (error) {
      void error;
    }
  }, [excludedIds, folderPath, ratings]);

  const loadDirectory = useCallback(async (directory: FileSystemDirectoryHandle, trail: Breadcrumb[]) => {
    setScanStatus("loading");
    setScanError(undefined);
    setPreviewOpen(false);
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
    const next = updateBridgeSelection({
      current: selectedIds,
      orderedIds: scan.jpgs.map((item) => item.id),
      clickedId: photo.id,
      anchorId,
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    });
    setSelectedIds(next);
    setAnchorId(photo.id);
    setFocusedId(photo.id);
  }, [anchorId, scan.jpgs, selectedIds]);

  const moveFocus = useCallback((delta: number) => {
    if (!scan.jpgs.length) return;
    const current = focusedIndex >= 0 ? focusedIndex : 0;
    const nextIndex = Math.max(0, Math.min(scan.jpgs.length - 1, current + delta));
    const next = scan.jpgs[nextIndex];
    setFocusedId(next.id);
    setSelectedIds(new Set([next.id]));
    setAnchorId(next.id);
    document.querySelector<HTMLElement>(`[data-bridge-photo-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedIndex, scan.jpgs]);

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
      for (const id of targets) exclude ? next.add(id) : next.delete(id);
      return next;
    });
  }, [focusedId, selectedIds]);

  const handleKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(event.target)) return;
    if (event.key === "Escape") {
      if (previewOpen) setPreviewOpen(false);
      else if (toolKey) setToolKey(undefined);
      return;
    }
    if (toolKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveFocus(-1); }
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveFocus(1); }
    else if (event.key === " ") { event.preventDefault(); if (focusedPhoto) setPreviewOpen((value) => !value); }
    else if (/^[0-5]$/.test(event.key)) applyRating(Number(event.key));
    else if (event.key.toLocaleLowerCase("en-US") === "x" || (event.altKey && event.key === "Delete")) { event.preventDefault(); toggleExcluded(); }
    else if (event.key === "+" || event.key === "=") setThumbnailSize((value) => Math.min(240, value + 18));
    else if (event.key === "-") setThumbnailSize((value) => Math.max(96, value - 18));
    else if (event.key === "Tab") { event.preventDefault(); setLeftPanelOpen((value) => !value); setRightPanelOpen((value) => !value); }
  }, [applyRating, focusedPhoto, moveFocus, previewOpen, toggleExcluded, toolKey]);

  const openTool = useCallback((key: ToolKey) => {
    if (!currentLocalFolder) return;
    setToolKey(key);
  }, [currentLocalFolder]);

  const scenePhotoByName = useMemo(() => new Map(scan.jpgs.map((photo) => [photo.name, photo])), [scan.jpgs]);

  return (
    <div ref={rootRef} className={styles.bridge} tabIndex={0} onKeyDown={handleKeyboard} aria-label="Olivia Bridge 사진 작업공간">
      <header className={styles.header}>
        <div>
          <h1>Olivia Bridge</h1>
          <p>폴더를 유지한 채 사진을 보고, 고르고, 기존 작업 도구를 실행합니다.</p>
        </div>
        <div className={styles.headerStats}>
          <span>폴더 <b>{activeFolder?.name ?? "선택 안 됨"}</b></span>
          <span>JPG <b>{scan.jpgs.length.toLocaleString("ko-KR")}</b></span>
          <span>RAW <b>{scan.raws.length.toLocaleString("ko-KR")}</b></span>
          <span className={sceneState.status === "complete" ? styles.statusComplete : sceneState.status === "error" ? styles.statusError : styles.statusRunning}>
            {sceneState.status === "running" ? <LoaderCircle className={styles.spin} size={13} /> : sceneState.status === "complete" ? <Sparkles size={13} /> : <ScanSearch size={13} />}
            {sceneState.stage}
          </span>
        </div>
      </header>

      <nav className={styles.toolBar} aria-label="Bridge 기능 바로가기">
        <span>기능 바로가기</span>
        {TOOL_ITEMS.map((item) => (
          <button key={item.key} type="button" onClick={() => openTool(item.key)} disabled={!activeFolder}>{item.label}</button>
        ))}
      </nav>

      <div className={styles.pathBar}>
        <button type="button" className={styles.folderButton} onClick={() => void chooseFolder()}><FolderOpen size={15} /> 폴더 선택</button>
        <div className={styles.breadcrumbs} aria-label="현재 폴더 경로">
          {breadcrumbs.length ? breadcrumbs.map((item, index) => (
            <span key={`${item.name}-${index}`}>
              {index ? <ChevronRight size={12} /> : null}
              <button type="button" onClick={() => void loadDirectory(item.handle, breadcrumbs.slice(0, index + 1))}>{item.name}</button>
            </span>
          )) : <span>작업할 촬영 폴더를 선택해 주세요.</span>}
        </div>
        {activeFolder ? <span className={styles.folderReady}>현재 폴더 열림</span> : null}
      </div>

      <main className={`${styles.workspace} ${leftPanelOpen ? "" : styles.withoutLeft} ${rightPanelOpen ? "" : styles.withoutRight}`}>
        {leftPanelOpen ? (
          <aside className={styles.folderPanel} aria-label="폴더 탐색">
            <div className={styles.panelTitle}><span>폴더</span><button type="button" onClick={() => setLeftPanelOpen(false)} aria-label="폴더 패널 닫기"><PanelLeftClose size={16} /></button></div>
            <button type="button" className={styles.rootFolder} onClick={() => breadcrumbs[0] && void loadDirectory(breadcrumbs[0].handle, breadcrumbs.slice(0, 1))} disabled={!breadcrumbs[0]}>
              <FolderOpen size={15} /> {breadcrumbs[0]?.name ?? "촬영 폴더"}
            </button>
            <div className={styles.folderList}>
              {scan.folders.map((folder) => (
                <button key={folder.name} type="button" onDoubleClick={() => void loadDirectory(folder, [...breadcrumbs, { name: folder.name, handle: folder }])} onClick={() => void loadDirectory(folder, [...breadcrumbs, { name: folder.name, handle: folder }])}>
                  <Folder size={14} /> <span>{folder.name}</span><ChevronRight size={12} />
                </button>
              ))}
              {activeFolder && !scan.folders.length ? <p>이 폴더 안에 하위 폴더가 없습니다.</p> : null}
            </div>
            <div className={styles.folderSummary}>
              <span>선택 <b>{selectedIds.size}</b>장</span>
              <span>별점 <b>{Object.keys(ratings).length}</b>장</span>
              <span>제외 <b>{excludedIds.size}</b>장</span>
            </div>
          </aside>
        ) : null}

        <section className={styles.browserPanel} aria-label="현재 폴더 사진">
          <div className={styles.browserHeader}>
            <div>
              {!leftPanelOpen ? <button type="button" onClick={() => setLeftPanelOpen(true)} aria-label="폴더 패널 열기"><PanelLeftClose size={16} /></button> : null}
              <strong>폴더 내용</strong><span>JPG 썸네일 · RAW 파일 형식</span>
            </div>
            <div className={styles.thumbnailControls}>
              <button type="button" onClick={() => setThumbnailSize((value) => Math.max(96, value - 18))} aria-label="썸네일 작게"><Minus size={14} /></button>
              <LayoutGrid size={14} aria-hidden="true" />
              <button type="button" onClick={() => setThumbnailSize((value) => Math.min(240, value + 18))} aria-label="썸네일 크게"><Plus size={14} /></button>
              {!rightPanelOpen ? <button type="button" onClick={() => setRightPanelOpen(true)} aria-label="Scene 패널 열기"><PanelRightClose size={16} /></button> : null}
            </div>
          </div>

          {scanStatus === "idle" ? (
            <div className={styles.emptyState}><FolderOpen size={32} /><strong>촬영 폴더를 먼저 선택해 주세요</strong><p>JPG는 썸네일로, RAW는 파일 정보로만 보여줍니다.</p><button type="button" onClick={() => void chooseFolder()}>폴더 선택</button></div>
          ) : null}
          {scanStatus === "loading" ? <div className={styles.emptyState}><LoaderCircle className={styles.spin} size={30} /><strong>폴더를 읽는 중입니다</strong><p>사진은 보이는 순서부터 썸네일을 만듭니다.</p></div> : null}
          {scanStatus === "error" ? <div className={styles.emptyState}><CircleAlert size={30} /><strong>폴더를 읽지 못했습니다</strong><p>{scanError}</p><button type="button" onClick={() => void chooseFolder()}>다른 폴더 선택</button></div> : null}
          {scanStatus === "ready" ? (
            <div className={styles.fileArea}>
              {scan.jpgs.length ? (
                <div className={styles.thumbnailGrid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))` }}>
                  {scan.jpgs.map((photo) => {
                    const selected = selectedIds.has(photo.id);
                    const focused = focusedId === photo.id;
                    const excluded = excludedIds.has(photo.id);
                    const rating = ratings[photo.id] ?? 0;
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        data-bridge-photo-id={photo.id}
                        className={`${styles.thumbnailCard} ${selected ? styles.selected : ""} ${focused ? styles.focused : ""} ${excluded ? styles.excluded : ""}`}
                        onClick={(event) => choosePhoto(photo, event)}
                        onDoubleClick={() => { setFocusedId(photo.id); setPreviewOpen(true); }}
                        aria-pressed={selected}
                      >
                        <BridgeThumbnail photo={photo} alt={photo.name} />
                        <span className={styles.photoName}>{photo.name}</span>
                        {rating ? <span className={styles.rating}><Star size={11} fill="currentColor" />{rating}</span> : null}
                        {excluded ? <span className={styles.rejectMark}>X</span> : null}
                        {selected ? <span className={styles.selectMark} aria-label="선택됨" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : <div className={styles.noPhotos}><ImageIcon size={26} /><span>이 폴더에는 JPG가 없습니다.</span></div>}

              {scan.raws.length ? (
                <div className={styles.rawSection}>
                  <header><strong>RAW 파일</strong><span>미리보기 없음 · 파일명과 형식만 표시</span></header>
                  <div>
                    {scan.raws.map((raw) => <span key={raw.id}><b>{raw.extension}</b><em>{raw.name}</em><small>{formatBytes(raw.size)}</small></span>)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <footer className={styles.shortcutBar}>
            <span>← → 이동</span><span>Space 미리보기</span><span>⌘ 클릭 추가 선택</span><span>Shift 범위 선택</span><span>1–5 별점 · 0 해제</span><span>X 제외</span><span>Tab 패널</span>
            {scan.ignoredCount ? <i>숨김·비사진 파일 {scan.ignoredCount}개 제외</i> : null}
          </footer>
        </section>

        {rightPanelOpen ? (
          <aside className={styles.scenePanel} aria-label="Scene 분류 검토">
            <div className={styles.panelTitle}><span>Scene 분류 검토</span><button type="button" onClick={() => setRightPanelOpen(false)} aria-label="Scene 패널 닫기"><PanelRightClose size={16} /></button></div>
            <div className={styles.sceneStatus}>
              <span>{sceneState.status === "running" ? <LoaderCircle className={styles.spin} size={15} /> : sceneState.status === "error" ? <CircleAlert size={15} /> : <Sparkles size={15} />}</span>
              <div><strong>{sceneState.stage}</strong><small>{sceneState.status === "running" ? `${sceneState.completed} / ${sceneState.total}` : `JPG ${scan.jpgs.length.toLocaleString("ko-KR")}장 분석`}</small></div>
              {sceneState.status === "error" ? <button type="button" onClick={() => setSceneRunKey((value) => value + 1)} aria-label="Scene 분석 다시 시도"><RefreshCw size={14} /></button> : null}
            </div>
            {sceneState.status === "running" ? <div className={styles.progress}><span style={{ width: `${sceneState.total ? Math.min(100, sceneState.completed / sceneState.total * 100) : 4}%` }} /></div> : null}
            {sceneState.error ? <p className={styles.sceneError}>{sceneState.error}</p> : null}
            <div className={styles.sceneGrid}>
              {sceneState.scenes.map((scene) => {
                const photo = scenePhotoByName.get(scene.representativeFileName);
                return (
                  <article key={scene.id}>
                    {photo ? <BridgeThumbnail photo={photo} alt={`${scene.label} 대표 사진`} eager /> : <div className={styles.scenePlaceholder}><ImageIcon size={18} /></div>}
                    <div><strong>{scene.label}</strong><span>{scene.fileCount}장</span></div>
                    <small>{scene.firstFileName}<br />– {scene.lastFileName}</small>
                    {scene.needsReview ? <i>경계 확인 필요</i> : null}
                  </article>
                );
              })}
              {sceneState.status === "complete" && !sceneState.scenes.length ? <p>표시할 Scene이 없습니다.</p> : null}
            </div>
            <div className={styles.sceneActions}>
              <button type="button" className={styles.secondaryAction} disabled={!sceneState.scenes.length} onClick={() => setPreviewOpen(Boolean(focusedPhoto))}><Maximize2 size={15} /> 미리보기 전체 확인</button>
              <button type="button" className={styles.primaryAction} disabled={!activeFolder || sceneState.status !== "complete"} onClick={() => openTool("classification")}><ScanSearch size={15} /> 승인하고 분류 실행</button>
              <p>사전 분석은 파일을 바꾸지 않습니다. 실제 분류는 기존 검토 화면에서 승인한 뒤 실행됩니다.</p>
            </div>
          </aside>
        ) : null}
      </main>

      {previewOpen && focusedPhoto ? (
        <div className={styles.previewOverlay} role="dialog" aria-modal="true" aria-label={`${focusedPhoto.name} 미리보기`}>
          <button type="button" className={styles.closeButton} onClick={() => setPreviewOpen(false)} aria-label="미리보기 닫기"><X size={22} /></button>
          <button type="button" className={`${styles.previewArrow} ${styles.previewArrowLeft}`} onClick={() => moveFocus(-1)} disabled={focusedIndex <= 0} aria-label="이전 사진"><ChevronLeft size={26} /></button>
          <div className={styles.previewImage}><BridgePreviewImage photo={focusedPhoto} /></div>
          <button type="button" className={`${styles.previewArrow} ${styles.previewArrowRight}`} onClick={() => moveFocus(1)} disabled={focusedIndex >= scan.jpgs.length - 1} aria-label="다음 사진"><ChevronRight size={26} /></button>
          <div className={styles.previewMeta}><strong>{focusedPhoto.name}</strong><span>{focusedIndex + 1} / {scan.jpgs.length}</span><span>{formatBytes(focusedPhoto.size)}</span><span>별점 {ratings[focusedPhoto.id] ?? 0}</span>{excludedIds.has(focusedPhoto.id) ? <i>제외 표시</i> : null}</div>
        </div>
      ) : null}

      {activeTool ? (
        <div className={styles.toolOverlay} role="dialog" aria-modal="true" aria-label={`${activeTool.label} 도구`}>
          <div className={styles.toolWindow}>
            <header><div><strong>{activeTool.label}</strong><span>{activeFolder?.name} · 선택 JPG {selectedNames.length}장</span></div><button type="button" onClick={() => setToolKey(undefined)} aria-label={`${activeTool.label} 닫기`}><X size={20} /></button></header>
            <div className={styles.toolBody}>
              <EmbeddedPhotoTool mode={activeTool.mode} selectMode={activeTool.selectMode} fileOpsMode={activeTool.fileOpsMode} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
