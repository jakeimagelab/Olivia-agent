"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Expand,
  Folder,
  FolderOpen,
  Grid3X3,
  Images,
  RotateCcw,
  Star,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  addCustomerBridgeRange,
  applyCustomerBridgeRating,
  customerBridgeFolderView,
  toggleCustomerBridgeSelection,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import {
  bridgeReviewDeckWindow,
  bridgeReviewLayout,
  removeBridgeReviewItem,
  restoreBridgeReviewItem,
  type BridgeReviewRemovedItem,
} from "@/lib/photo-bridge/reviewMode";
import {
  bridgeMarqueeSelection,
  bridgeMarqueeUsesAdditiveSelection,
  bridgeRectangleFromPoints,
  bridgeRectanglesIntersect,
} from "@/lib/photo-bridge/marqueeSelection";
import styles from "./CustomerBridgeSelect.module.css";

export type CustomerBridgeGallery = {
  id: string;
  title: string;
  hospital_name?: string | null;
  shooting_name?: string | null;
  total_jpg_count: number;
  allow_resubmit: boolean;
};

export type CustomerBridgeImage = {
  id: string;
  original_file_name: string;
  relative_path?: string | null;
  thumbnail_url?: string | null;
  image_url: string;
  sort_order: number;
};

export type CustomerBridgeDraft = {
  revision: number;
  selectedImageIds: string[];
  ratings: Record<string, number>;
  imageNotes: Record<string, string>;
  customerMemo: string;
  updatedAt?: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
type PhotoFilter = "all" | "selected" | "unselected";

const PAGE_SIZE = 240;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function validRatings(value: Record<string, number> | undefined) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, rating]) => Number.isInteger(rating) && rating >= 1 && rating <= 5),
  ) as Record<string, CustomerBridgeRating>;
}

function selectionItems(
  ids: ReadonlySet<string>,
  ratings: Record<string, CustomerBridgeRating>,
  notes: Record<string, string>,
) {
  return [...ids].map((imageId) => ({ imageId, rating: ratings[imageId] ?? null, memo: notes[imageId] ?? "" }));
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `bridge_${crypto.randomUUID()}`;
  return `bridge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function reportOptionalStorageError(scope: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") console.debug(`[customer-bridge:${scope}] browser storage unavailable`, error);
}

export default function CustomerBridgeSelect({
  shareToken,
  gallery,
  images,
  initialDraft,
  initialSelection,
  onSubmitted,
  apiBase,
  storageScope,
  readOnly = false,
  embedded = false,
}: {
  shareToken: string;
  gallery: CustomerBridgeGallery;
  images: CustomerBridgeImage[];
  initialDraft?: CustomerBridgeDraft | null;
  initialSelection?: { items?: Array<{ image_id: string; customer_rating?: number | null; memo?: string | null }>; customer_memo?: string | null } | null;
  onSubmitted: (selection: unknown) => void;
  /** select-gallery 외의 프로젝트 공유 셀렉도 같은 실제 조작 UI를 재사용한다. */
  apiBase?: string;
  storageScope?: string;
  /** 관리자 사진 확인에서는 같은 Bridge를 쓰되 고객 선택 데이터는 변경하지 않는다. */
  readOnly?: boolean;
  /** Olivia OS 패널 안에 들어갈 때 100dvh 대신 부모 작업영역을 사용한다. */
  embedded?: boolean;
}) {
  const endpointBase = apiBase ?? `/api/select/${shareToken}`;
  const localStorageScope = storageScope ?? shareToken;
  const imageIds = useMemo(() => new Set(images.map((image) => image.id)), [images]);
  const seedIds = useMemo(() => {
    if (initialDraft) return initialDraft.selectedImageIds.filter((id) => imageIds.has(id));
    return (initialSelection?.items ?? []).map((item) => item.image_id).filter((id) => imageIds.has(id));
  }, [imageIds, initialDraft, initialSelection]);
  const seedRatings = useMemo(() => validRatings(
    initialDraft?.ratings
      ?? Object.fromEntries((initialSelection?.items ?? []).map((item) => [item.image_id, item.customer_rating ?? 0])),
  ), [initialDraft, initialSelection]);
  const seedNotes = useMemo(() => initialDraft?.imageNotes
    ?? Object.fromEntries((initialSelection?.items ?? []).filter((item) => item.memo).map((item) => [item.image_id, item.memo ?? ""])), [initialDraft, initialSelection]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(seedIds));
  const [ratings, setRatings] = useState<Record<string, CustomerBridgeRating>>(seedRatings);
  const [notes, setNotes] = useState<Record<string, string>>(seedNotes);
  const [customerMemo, setCustomerMemo] = useState(initialDraft?.customerMemo ?? initialSelection?.customer_memo ?? "");
  const [filter, setFilter] = useState<PhotoFilter>("all");
  const [thumbSize, setThumbSize] = useState(168);
  const [focusedId, setFocusedId] = useState<string | null>(seedIds[0] ?? images[0]?.id ?? null);
  const [anchorId, setAnchorId] = useState<string | null>(seedIds[0] ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [renderLimit, setRenderLimit] = useState(PAGE_SIZE);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[] | null>(null);
  const [reviewActiveId, setReviewActiveId] = useState<string | null>(null);
  const [reviewRemoved, setReviewRemoved] = useState<BridgeReviewRemovedItem | null>(null);
  const [mobile, setMobile] = useState(false);
  const [currentFolderPath, setCurrentFolderPath] = useState<string | null>("");

  const revisionRef = useRef(initialDraft?.revision ?? 0);
  const dirtyRef = useRef(false);
  const editVersionRef = useRef(0);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const requestKeyRef = useRef(createRequestKey());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{
    start: { x: number; y: number };
    initial: Set<string>;
    additive: boolean;
    active: boolean;
  } | null>(null);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const folderView = useMemo(() => customerBridgeFolderView(images, currentFolderPath ?? ""), [currentFolderPath, images]);
  const folderImages = currentFolderPath === null ? images : folderView.images;
  const visibleImages = useMemo(() => folderImages.filter((image) => {
    if (filter === "selected") return selectedIds.has(image.id);
    if (filter === "unselected") return !selectedIds.has(image.id);
    return true;
  }), [filter, folderImages, selectedIds]);
  const orderedIds = useMemo(() => visibleImages.map((image) => image.id), [visibleImages]);
  const renderedImages = visibleImages.slice(0, renderLimit);
  const selectedInFolder = useMemo(() => folderImages.reduce((count, image) => count + (selectedIds.has(image.id) ? 1 : 0), 0), [folderImages, selectedIds]);
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);
  const fullscreenIndex = fullscreenId ? visibleImages.findIndex((image) => image.id === fullscreenId) : -1;

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    editVersionRef.current += 1;
    setSaveState("idle");
    setSaveMessage("");
  }, []);

  const toggle = useCallback((id: string) => {
    if (readOnly) return;
    setFocusedId(id);
    setAnchorId(id);
    setSelectedIds((currentIds) => {
      const next = toggleCustomerBridgeSelection({ selectedIds: currentIds, ratings }, id);
      setRatings(next.ratings);
      return next.selectedIds;
    });
    markDirty();
  }, [markDirty, ratings, readOnly]);

  const setRating = useCallback((id: string, rating: 0 | CustomerBridgeRating) => {
    if (readOnly) return;
    setFocusedId(id);
    setAnchorId(id);
    setSelectedIds((currentIds) => {
      const next = applyCustomerBridgeRating({ selectedIds: currentIds, ratings }, new Set([id]), rating);
      setRatings(next.ratings);
      return next.selectedIds;
    });
    markDirty();
  }, [markDirty, ratings, readOnly]);

  const moveFullscreen = useCallback((delta: -1 | 1) => {
    if (!visibleImages.length) return;
    const current = fullscreenIndex >= 0 ? fullscreenIndex : 0;
    setFullscreenId(visibleImages[(current + delta + visibleImages.length) % visibleImages.length].id);
    setZoomed(false);
  }, [fullscreenIndex, visibleImages]);

  const openReview = useCallback(() => {
    const ids = images.filter((image) => selectedIds.has(image.id)).map((image) => image.id);
    if (!ids.length) return;
    setReviewIds(ids);
    setReviewActiveId(focusedId && ids.includes(focusedId) ? focusedId : ids[0]);
    setReviewRemoved(null);
  }, [focusedId, images, selectedIds]);

  const saveDraft = useCallback(async (options?: { quiet?: boolean }) => {
    if (readOnly) return true;
    if (saveInFlightRef.current) await saveInFlightRef.current;
    if (!dirtyRef.current && options?.quiet) return true;
    const controller = new AbortController();
    saveAbortRef.current = controller;
    const editVersion = editVersionRef.current;
    const request = (async () => {
      setSaveState("saving");
      setSaveMessage("저장 중");
      try {
        const response = await fetch(`${endpointBase}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            revision: revisionRef.current,
            items: selectionItems(selectedIds, ratings, notes),
            customerMemo,
          }),
        });
        const result = await response.json();
        if (response.status === 409) {
          setSaveState("conflict");
          setSaveMessage("다른 화면에서 변경됨 · 새로고침 후 확인해 주세요");
          return false;
        }
        if (!response.ok || !result.ok) throw new Error(result.error ?? "선택을 저장하지 못했습니다.");
        revisionRef.current = Number(result.draft?.revision ?? revisionRef.current + 1);
        const isLatestEdit = editVersionRef.current === editVersion;
        if (isLatestEdit) dirtyRef.current = false;
        setSaveState(isLatestEdit ? "saved" : "idle");
        setSaveMessage(isLatestEdit ? "저장됨" : "추가 변경 저장 대기");
        try { localStorage.removeItem(`customer-bridge-draft:${localStorageScope}`); } catch (error) { reportOptionalStorageError("draft-clear", error); }
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        setSaveState("error");
        setSaveMessage(error instanceof Error ? error.message : "저장 실패 · 다시 시도");
        try {
          localStorage.setItem(`customer-bridge-draft:${localStorageScope}`, JSON.stringify({
            selectedImageIds: [...selectedIds], ratings, imageNotes: notes, customerMemo,
          }));
        } catch (storageError) { reportOptionalStorageError("draft-backup", storageError); }
        return false;
      }
    })();
    saveInFlightRef.current = request;
    try { return await request; }
    finally {
      if (saveInFlightRef.current === request) saveInFlightRef.current = null;
      if (saveAbortRef.current === controller) saveAbortRef.current = null;
    }
  }, [customerMemo, endpointBase, localStorageScope, notes, ratings, readOnly, selectedIds]);

  useEffect(() => {
    if (readOnly) return;
    if (!dirtyRef.current) return;
    const timer = window.setTimeout(() => { void saveDraft({ quiet: true }); }, 550);
    return () => window.clearTimeout(timer);
  }, [customerMemo, notes, ratings, readOnly, saveDraft, selectedIds]);

  useEffect(() => () => saveAbortRef.current?.abort(), []);

  useEffect(() => {
    if (readOnly) return;
    if (initialDraft || initialSelection) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`customer-bridge-draft:${localStorageScope}`) || "null") as {
        selectedImageIds?: string[];
        ratings?: Record<string, number>;
        imageNotes?: Record<string, string>;
        customerMemo?: string;
      } | null;
      if (!stored) return;
      const restoredIds = new Set((stored.selectedImageIds ?? []).filter((id) => imageIds.has(id)));
      setSelectedIds(restoredIds);
      setRatings(validRatings(stored.ratings));
      setNotes(stored.imageNotes ?? {});
      setCustomerMemo(stored.customerMemo ?? "");
      dirtyRef.current = true;
      setSaveState("error");
      setSaveMessage("기기에 보관한 선택을 복구했습니다 · 다시 저장 중");
    } catch (error) { reportOptionalStorageError("draft-restore", error); }
  }, [imageIds, initialDraft, initialSelection, localStorageScope, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    try {
      const storageKey = `customer-bridge-submit-key:${localStorageScope}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) requestKeyRef.current = stored;
      else localStorage.setItem(storageKey, requestKeyRef.current);
    } catch (error) { reportOptionalStorageError("submit-key", error); }
  }, [localStorageScope, readOnly]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px), (pointer: coarse)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || renderLimit >= visibleImages.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setRenderLimit((current) => current + PAGE_SIZE);
    }, { rootMargin: "500px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [renderLimit, visibleImages.length]);

  useEffect(() => setRenderLimit(PAGE_SIZE), [filter, currentFolderPath]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        if (fullscreenId) setFullscreenId(null);
        else if (reviewIds) setReviewIds(null);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        openReview();
        return;
      }
      if (event.key === " " && focusedId && !reviewIds) {
        event.preventDefault();
        setFullscreenId(focusedId);
        return;
      }
      const activeId = fullscreenId ?? reviewActiveId ?? focusedId;
      if (!readOnly && /^[0-5]$/.test(event.key) && activeId) {
        event.preventDefault();
        setRating(activeId, Number(event.key) as 0 | CustomerBridgeRating);
        if (reviewIds && event.key === "0") {
          const removed = removeBridgeReviewItem(reviewIds, activeId);
          setReviewIds(removed.remainingIds);
          setReviewActiveId(removed.nextActiveId);
          setReviewRemoved(removed.removed);
        }
        return;
      }
      if (reviewIds) {
        if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && reviewIds.length) {
          event.preventDefault();
          const index = Math.max(0, reviewIds.indexOf(reviewActiveId ?? reviewIds[0]));
          const delta = event.key === "ArrowLeft" ? -1 : 1;
          setReviewActiveId(reviewIds[(index + delta + reviewIds.length) % reviewIds.length]);
        } else if (event.key === "ArrowDown" && reviewActiveId) {
          event.preventDefault();
          const removed = removeBridgeReviewItem(reviewIds, reviewActiveId);
          setReviewIds(removed.remainingIds);
          setReviewActiveId(removed.nextActiveId);
          setReviewRemoved(removed.removed);
          setRating(reviewActiveId, 0);
        } else if (event.key === "ArrowUp" && reviewRemoved) {
          event.preventDefault();
          const restored = restoreBridgeReviewItem(reviewIds, reviewRemoved);
          setReviewIds(restored.restoredIds);
          setReviewActiveId(restored.activeId);
          setReviewRemoved(null);
          if (restored.activeId) toggle(restored.activeId);
        }
        return;
      }
      if (fullscreenId && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        moveFullscreen(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (!focusedId || !event.key.startsWith("Arrow")) return;
      const currentIndex = orderedIds.indexOf(focusedId);
      if (currentIndex < 0) return;
      const columnCount = Math.max(1, Math.round((gridRef.current?.clientWidth ?? thumbSize) / (thumbSize + 8)));
      const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columnCount : columnCount;
      const nextId = orderedIds[Math.max(0, Math.min(orderedIds.length - 1, currentIndex + delta))];
      if (!nextId) return;
      event.preventDefault();
      if (event.shiftKey && !readOnly) {
        const nextSelected = addCustomerBridgeRange({ current: selectedIds, orderedIds, anchorId: anchorId ?? focusedId, targetId: nextId });
        setSelectedIds(nextSelected);
        markDirty();
      } else {
        setAnchorId(nextId);
      }
      setFocusedId(nextId);
      document.querySelector<HTMLElement>(`[data-bridge-image-id="${CSS.escape(nextId)}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anchorId, focusedId, fullscreenId, markDirty, moveFullscreen, openReview, orderedIds, readOnly, reviewActiveId, reviewIds, reviewRemoved, selectedIds, setRating, thumbSize, toggle]);

  const handlePhotoClick = (image: CustomerBridgeImage, event: React.MouseEvent) => {
    setFocusedId(image.id);
    if (mobile) {
      setFullscreenId(image.id);
      return;
    }
    if (readOnly) return;
    if (event.shiftKey && anchorId) {
      setSelectedIds(addCustomerBridgeRange({ current: selectedIds, orderedIds, anchorId, targetId: image.id }));
      markDirty();
      return;
    }
    toggle(image.id);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || mobile || event.button !== 0 || (event.target as HTMLElement).closest("button,[data-bridge-card]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      start: { x: event.clientX - rect.left + event.currentTarget.scrollLeft, y: event.clientY - rect.top + event.currentTarget.scrollTop },
      initial: new Set(selectedIds),
      additive: bridgeMarqueeUsesAdditiveSelection(event),
      active: true,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer?.active || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const end = { x: event.clientX - rect.left + gridRef.current.scrollLeft, y: event.clientY - rect.top + gridRef.current.scrollTop };
    const box = bridgeRectangleFromPoints(pointer.start, end);
    setMarquee({ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top });
    const hits = new Set<string>();
    gridRef.current.querySelectorAll<HTMLElement>("[data-bridge-image-id]").forEach((node) => {
      const nodeRect = node.getBoundingClientRect();
      const candidate = {
        left: nodeRect.left - rect.left + gridRef.current!.scrollLeft,
        top: nodeRect.top - rect.top + gridRef.current!.scrollTop,
        right: nodeRect.right - rect.left + gridRef.current!.scrollLeft,
        bottom: nodeRect.bottom - rect.top + gridRef.current!.scrollTop,
      };
      if (bridgeRectanglesIntersect(box, candidate)) hits.add(node.dataset.bridgeImageId ?? "");
    });
    setSelectedIds(bridgeMarqueeSelection({ initial: pointer.initial, hits, additive: pointer.additive }));
  };

  const handlePointerUp = () => {
    if (pointerRef.current?.active) markDirty();
    pointerRef.current = null;
    setMarquee(null);
  };

  const submit = async () => {
    if (!selectedIds.size || submitting) return;
    if (!window.confirm(`${selectedIds.size}장을 최종 제출할까요?`)) return;
    setSubmitting(true);
    const saved = await saveDraft();
    if (!saved) { setSubmitting(false); return; }
    try {
      const response = await fetch(`${endpointBase}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: revisionRef.current,
          requestKey: requestKeyRef.current,
          items: selectionItems(selectedIds, ratings, notes),
          customerMemo,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "최종 제출에 실패했습니다.");
      requestKeyRef.current = createRequestKey();
      try { localStorage.removeItem(`customer-bridge-submit-key:${localStorageScope}`); } catch (error) { reportOptionalStorageError("submit-key-clear", error); }
      onSubmitted(result.selection);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "최종 제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const activeFullscreen = fullscreenId ? imageById.get(fullscreenId) : null;
  const reviewImages = (reviewIds ?? []).map((id) => imageById.get(id)).filter(Boolean) as CustomerBridgeImage[];

  const openFolder = (path: string | null) => {
    setCurrentFolderPath(path);
    const nextImages = path === null ? images : customerBridgeFolderView(images, path).images;
    setFocusedId(nextImages[0]?.id ?? null);
    setAnchorId(null);
  };

  return <main className={`${styles.page} ${embedded ? styles.embedded : ""} ${readOnly ? styles.readOnly : ""}`}>
    <header className={styles.header}>
      <div className={styles.brand}>PHOTO CLINIC · Olivia Bridge</div>
      <div className={styles.titleRow}>
        <div>
          <h1>{gallery.shooting_name ?? gallery.title}</h1>
          <p>{[gallery.hospital_name, `${images.length.toLocaleString("ko-KR")}장`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className={styles.saveState} data-state={saveState}>{readOnly ? "관리자 사진 확인" : saveMessage || "변경하면 자동 저장됩니다"}</div>
      </div>
      <div className={styles.toolbar}>
        <button className={styles.toolButton} type="button" aria-pressed={currentFolderPath !== null} onClick={() => openFolder("")}><FolderOpen size={16} /> 폴더</button>
        <button className={styles.toolButton} type="button" aria-pressed={currentFolderPath === null} onClick={() => openFolder(null)}><Grid3X3 size={16} /> 전체 사진</button>
        {currentFolderPath === null || !folderView.folders.length ? <div className={styles.segment} aria-label="사진 필터">
          {(["all", "selected", "unselected"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value === "all" ? `전체 ${folderImages.length}` : value === "selected" ? `선택 ${selectedInFolder}` : `미선택 ${folderImages.length - selectedInFolder}`}
          </button>)}
        </div> : null}
        <label className={styles.sizeControl}>썸네일 <input type="range" min={120} max={260} step={8} value={thumbSize} onChange={(event) => setThumbSize(Number(event.target.value))} /></label>
        <button className={styles.toolButton} type="button" disabled={!selectedIds.size} onClick={openReview}><Images size={16} /> 리뷰</button>
        <button className={styles.toolButton} type="button" disabled={!focusedId} onClick={() => focusedId && setFullscreenId(focusedId)}><Expand size={16} /> 전체화면</button>
      </div>
      <nav className={styles.folderBar} aria-label="사진 폴더 경로">
        <button type="button" aria-current={currentFolderPath === "" ? "page" : undefined} onClick={() => openFolder("")}>프로젝트</button>
        {currentFolderPath === null ? <><span>›</span><strong>전체 사진</strong></> : folderView.breadcrumbs.map((crumb) => <span className={styles.folderCrumb} key={crumb.path}><span>›</span><button type="button" aria-current={crumb.path === currentFolderPath ? "page" : undefined} onClick={() => openFolder(crumb.path)}>{crumb.name}</button></span>)}
      </nav>
    </header>

    <section className={styles.workspace}>
      <div className={styles.gridPane}>
        <div
          ref={gridRef}
          className={styles.grid}
          style={{ "--bridge-thumb": `${thumbSize}px` } as React.CSSProperties}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {currentFolderPath !== null ? folderView.folders.map((folder) => {
            const representative = folder.representativeImageId ? imageById.get(folder.representativeImageId) : null;
            return <button type="button" className={styles.folderCard} key={folder.path} onClick={() => openFolder(folder.path)}>
              <div className={styles.folderPreview}>{representative ? <img src={representative.thumbnail_url ?? representative.image_url} alt="" loading="lazy" /> : null}<span><Folder size={28} /></span></div>
              <div className={styles.folderMeta}><strong>{folder.name}</strong><span>{folder.totalCount.toLocaleString("ko-KR")}장</span></div>
              <small>{folder.path}</small>
            </button>;
          }) : null}
          {renderedImages.map((image) => {
            const selected = selectedIds.has(image.id);
            const focused = focusedId === image.id;
            const rating = ratings[image.id] ?? 0;
            return <article key={image.id} data-bridge-card data-bridge-image-id={image.id} className={styles.photoCard} data-selected={selected || undefined} data-focused={focused || undefined} onClick={(event) => handlePhotoClick(image, event)}>
              <div className={styles.thumb}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.thumbnail_url ?? image.image_url} alt={image.original_file_name} loading="lazy" decoding="async" />
                {!readOnly ? <button className={styles.checkButton} type="button" aria-label={`${image.original_file_name} ${selected ? "선택 해제" : "선택"}`} aria-pressed={selected} onClick={(event) => { event.stopPropagation(); toggle(image.id); }}>{selected ? <Check size={15} /> : null}</button> : selected ? <span className={styles.readOnlySelected}><Check size={14} /></span> : null}
                {rating ? <span className={styles.rating}><Star size={12} fill="currentColor" />{rating}</span> : null}
              </div>
              <div className={styles.fileName}>{image.original_file_name}</div>
            </article>;
          })}
          {marquee ? <div className={styles.marquee} style={marquee} /> : null}
          {!visibleImages.length && (currentFolderPath === null || !folderView.folders.length) ? <div className={styles.empty}>이 폴더에 사진이 없습니다.</div> : null}
          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
        </div>
      </div>

      <aside className={styles.inspector}>
        {focusedId && imageById.get(focusedId) ? <>
          <div className={styles.preview} onClick={() => setFullscreenId(focusedId)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageById.get(focusedId)!.image_url} alt={imageById.get(focusedId)!.original_file_name} />
          </div>
          <strong>{imageById.get(focusedId)!.original_file_name}</strong>
          {!readOnly ? <><div className={styles.ratingButtons} aria-label="고객 별점">
            {[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${rating}점`} aria-pressed={ratings[focusedId] === rating} onClick={() => setRating(focusedId, rating as CustomerBridgeRating)}>{rating}</button>)}
            <button type="button" aria-label="별점과 선택 해제" onClick={() => setRating(focusedId, 0)}>0</button>
          </div>
          <button className={selectedIds.has(focusedId) ? styles.selectedButton : styles.selectButton} type="button" onClick={() => toggle(focusedId)}>{selectedIds.has(focusedId) ? <><Check size={16} /> 선택됨</> : "이 사진 선택"}</button>
          <label className={styles.memoLabel}>사진별 보정 메모<textarea value={notes[focusedId] ?? ""} maxLength={1000} onChange={(event) => { setNotes((current) => ({ ...current, [focusedId]: event.target.value })); markDirty(); }} placeholder="이 사진에 필요한 보정 내용을 적어주세요." /></label>
          </> : notes[focusedId] ? <p className={styles.readOnlyMemo}>{notes[focusedId]}</p> : null}
        </> : <div className={styles.emptyInspector}><Grid3X3 size={22} /><span>사진을 누르면 크게 확인할 수 있습니다.</span></div>}
      </aside>
    </section>

    {!readOnly ? <footer className={styles.footer}>
      <label className={styles.overallMemo}>전체 메모<input value={customerMemo} maxLength={5000} onChange={(event) => { setCustomerMemo(event.target.value); markDirty(); }} placeholder="전체 보정 요청이 있으면 적어주세요." /></label>
      <div className={styles.footerSummary}><strong>{selectedIds.size}장 선택</strong><span>{saveMessage || "자동 저장"}</span></div>
      <button className={styles.reviewButton} type="button" disabled={!selectedIds.size} onClick={openReview}>리뷰</button>
      <button className={styles.submitButton} type="button" disabled={!selectedIds.size || submitting || saveState === "conflict"} onClick={() => void submit()}>{submitting ? "제출 중" : "최종 제출"}</button>
    </footer> : null}

    {activeFullscreen ? <PhotoOverlay
      image={activeFullscreen}
      index={fullscreenIndex}
      total={visibleImages.length}
      selected={selectedIds.has(activeFullscreen.id)}
      rating={ratings[activeFullscreen.id] ?? 0}
      note={notes[activeFullscreen.id] ?? ""}
      zoomed={zoomed}
      onZoom={() => setZoomed((value) => !value)}
      onClose={() => setFullscreenId(null)}
      onPrev={() => moveFullscreen(-1)}
      onNext={() => moveFullscreen(1)}
      onToggle={() => toggle(activeFullscreen.id)}
      onRate={(rating) => setRating(activeFullscreen.id, rating)}
      onNote={(value) => { setNotes((current) => ({ ...current, [activeFullscreen.id]: value })); markDirty(); }}
      readOnly={readOnly}
    /> : null}

    {reviewIds ? <ReviewOverlay
      images={reviewImages}
      activeId={reviewActiveId}
      removed={reviewRemoved}
      selectedIds={selectedIds}
      ratings={ratings}
      onActive={setReviewActiveId}
      onClose={() => setReviewIds(null)}
      onRemove={(id) => {
        const removed = removeBridgeReviewItem(reviewIds, id);
        setReviewIds(removed.remainingIds);
        setReviewActiveId(removed.nextActiveId);
        setReviewRemoved(removed.removed);
        setRating(id, 0);
      }}
      onRestore={() => {
        const restored = restoreBridgeReviewItem(reviewIds, reviewRemoved);
        setReviewIds(restored.restoredIds);
        setReviewActiveId(restored.activeId);
        setReviewRemoved(null);
        if (restored.activeId && !selectedIds.has(restored.activeId)) toggle(restored.activeId);
      }}
      onRate={setRating}
    /> : null}
  </main>;
}

function PhotoOverlay({ image, index, total, selected, rating, note, zoomed, onZoom, onClose, onPrev, onNext, onToggle, onRate, onNote, readOnly }: {
  image: CustomerBridgeImage;
  index: number;
  total: number;
  selected: boolean;
  rating: number;
  note: string;
  zoomed: boolean;
  onZoom: () => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
  onRate: (rating: 0 | CustomerBridgeRating) => void;
  onNote: (value: string) => void;
  readOnly: boolean;
}) {
  const touchStart = useRef<number | null>(null);
  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="사진 전체화면" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current === null || end === undefined) return; const delta = end - touchStart.current; if (delta > 55) onPrev(); else if (delta < -55) onNext(); touchStart.current = null; }}>
    <div className={styles.overlayHeader}>
      <button type="button" aria-label="닫기" onClick={onClose}><X /></button>
      <div><strong>{image.original_file_name}</strong><span>{index + 1} / {total}</span></div>
      <button type="button" onClick={onZoom}>{zoomed ? "화면 맞춤" : "확대"}</button>
    </div>
    <div className={zoomed ? styles.overlayImageZoomed : styles.overlayImage} onDoubleClick={onZoom}>
      <button type="button" aria-label="이전" onClick={onPrev}><ChevronLeft /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.image_url} alt={image.original_file_name} />
      <button type="button" aria-label="다음" onClick={onNext}><ChevronRight /></button>
    </div>
    {!readOnly ? <div className={styles.overlayControls}>
      <div className={styles.ratingButtons}>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-pressed={rating === value} onClick={() => onRate(value as CustomerBridgeRating)}>{value}</button>)}<button type="button" onClick={() => onRate(0)}>0</button></div>
      <button className={selected ? styles.selectedButton : styles.selectButton} type="button" onClick={onToggle}>{selected ? <><Check size={16} /> 선택됨</> : "사진 선택"}</button>
      <textarea value={note} maxLength={1000} onChange={(event) => onNote(event.target.value)} placeholder="사진별 보정 메모" />
    </div> : null}
  </div>;
}

function ReviewOverlay({ images, activeId, removed, selectedIds, ratings, onActive, onClose, onRemove, onRestore, onRate }: {
  images: CustomerBridgeImage[];
  activeId: string | null;
  removed: BridgeReviewRemovedItem | null;
  selectedIds: ReadonlySet<string>;
  ratings: Record<string, CustomerBridgeRating>;
  onActive: (id: string) => void;
  onClose: () => void;
  onRemove: (id: string) => void;
  onRestore: () => void;
  onRate: (id: string, rating: 0 | CustomerBridgeRating) => void;
}) {
  const touchStart = useRef<number | null>(null);
  const layout = bridgeReviewLayout(images.length);
  const activeIndex = Math.max(0, images.findIndex((image) => image.id === activeId));
  const displayed = layout === "deck" ? bridgeReviewDeckWindow(images, activeIndex) : images.map((image) => ({ item: image, offset: 0 }));
  const moveActive = (delta: -1 | 1) => {
    if (!images.length) return;
    onActive(images[(activeIndex + delta + images.length) % images.length].id);
  };
  return <div className={styles.reviewOverlay} role="dialog" aria-modal="true" aria-label="선택 사진 리뷰">
    <div className={styles.overlayHeader}>
      <button type="button" aria-label="닫기" onClick={onClose}><X /></button>
      <div><strong>선택 사진 리뷰</strong><span>{images.length}장 · {layout === "single" ? "한 장" : layout === "grid" ? "비교" : "로테이션"}</span></div>
      <button type="button" disabled={!removed} onClick={onRestore}><RotateCcw size={15} /> 복원</button>
    </div>
    <div className={`${styles.reviewStage} ${styles[`review_${layout}`]}`} onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current === null || end === undefined) return; const delta = end - touchStart.current; if (delta > 55) moveActive(-1); else if (delta < -55) moveActive(1); touchStart.current = null; }}>
      {displayed.map(({ item, offset }) => <button key={item.id} type="button" className={styles.reviewPhoto} data-active={item.id === activeId || undefined} style={layout === "deck" ? { "--deck-offset": offset } as React.CSSProperties : undefined} onClick={() => onActive(item.id)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image_url} alt={item.original_file_name} />
        <span>{item.original_file_name}</span>
      </button>)}
      {!images.length ? <div className={styles.reviewEmpty}>모든 사진을 제외했습니다. 위의 복원 버튼으로 직전 사진을 되돌릴 수 있습니다.</div> : null}
    </div>
    {activeId ? <div className={styles.reviewControls}>
      <button type="button" className={styles.reviewMoveButton} onClick={() => moveActive(-1)} aria-label="이전 사진"><ChevronLeft size={17} /></button>
      <div className={styles.ratingButtons}>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-pressed={ratings[activeId] === value} onClick={() => onRate(activeId, value as CustomerBridgeRating)}>{value}</button>)}</div>
      <button type="button" className={styles.reviewMoveButton} onClick={() => moveActive(1)} aria-label="다음 사진"><ChevronRight size={17} /></button>
      <button type="button" className={styles.removeButton} disabled={!selectedIds.has(activeId)} onClick={() => onRemove(activeId)}>선택 해제</button>
    </div> : null}
  </div>;
}
