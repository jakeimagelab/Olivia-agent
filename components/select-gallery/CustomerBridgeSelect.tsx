"use client";

import {
  AlertTriangle,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Folder,
  FolderOpen,
  Images,
  LayoutGrid,
  MessageCircle,
  Minus,
  PanelLeft,
  Plus,
  RotateCcw,
  Search,
  Send,
  Star,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  applyCustomerColorLabels,
  applyCustomerRatings,
  clearCustomerBridgeMarks,
  normalizeCustomerBridgeSelectionMarks,
  customerBridgeRatingTargets,
  customerBridgeSelectedIds,
  toggleCustomerColorLabels,
  type CustomerBridgeColorLabel,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import {
  BRIDGE_COLOR_LABELS,
  EMPTY_BRIDGE_LABEL_FILTERS,
  bridgeLabelFilterName,
  updateBridgeLabelFilters,
  type BridgeLabelFilterCommand,
  type BridgeLabelFilters,
} from "@/lib/photo-bridge/labels";
import { useBridgeSearchFilterShortcuts } from "@/lib/photo-bridge/useBridgeSearchFilterShortcuts";
import PhotoQualityJobProgressView from "@/components/photo-quality/PhotoQualityJobProgress";
import { useSelectionSyncQueue } from "@/components/person-select/useSelectionSyncQueue";
import { sendSelectionSyncBatch } from "@/lib/person-select/selectionSyncClient";
import { useVisibleSelectionRefresh } from "@/components/person-select/useVisibleSelectionRefresh";
import { FinalSelectionSubmitDialog } from "@/components/person-select/FinalSelectionSubmitDialog";
import {
  SELECTION_THUMBNAIL_PAGE_SIZE,
  type SelectionMediaUrls,
  type SelectionMediaVariant,
} from "@/lib/select-gallery/mediaLoading";
import {
  applySelectionDiffsToSharedSnapshot,
  type SelectionSyncDiff,
  type SelectionSyncPatch,
  type SharedSelectionSyncSnapshot,
} from "@/lib/person-select/selectionSync";
import styles from "./CustomerBridgeSelect.module.css";
import {
  ColorLabels,
  CustomerBridgeThumbnailCard,
  RatingStars,
  StablePreviewImage,
} from "./CustomerBridgeMedia";
import type { CustomerBridgeDraft, CustomerBridgeGallery, CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import { PhotoOverlay, ReviewOverlay } from "./CustomerBridgeOverlays";
import { useCustomerBridgeLocation } from "./useCustomerBridgeLocation";
import { useCustomerBridgeActiveSelection } from "./useCustomerBridgeActiveSelection";
import { useCustomerBridgeReviewController } from "./useCustomerBridgeReviewController";
import { useCustomerBridgeKeyboard } from "./useCustomerBridgeKeyboard";
import { useCustomerBridgeMediaRequests, useCustomerBridgeMediaStore } from "./useCustomerBridgeMedia";
import { useCustomerBridgeMessages } from "./useCustomerBridgeMessages";
import { useCustomerBridgeQuality } from "./useCustomerBridgeQuality";
import { useCustomerBridgeDownload } from "./useCustomerBridgeDownload";
import { buildCustomerBridgePhotoView, type CustomerBridgePhotoFilter as PhotoFilter } from "@/lib/select-gallery/customerBridgeView";

export type { CustomerBridgeDraft, CustomerBridgeGallery, CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";

const PAGE_SIZE = SELECTION_THUMBNAIL_PAGE_SIZE;
const THUMB_MIN = 112;
const THUMB_MAX = 260;

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
  images: initialImages,
  initialDraft,
  initialSelection,
  onSubmitted,
  apiBase,
  storageScope,
  readOnly = false,
  embedded = false,
  refreshImageUrl,
  loadImageUrls,
  reviewer,
  messagesEnabled = false,
  qualityApi,
  canManageQuality = false,
  adminToolbarAction,
  adminToolbarStatus,
}: {
  shareToken: string;
  gallery: CustomerBridgeGallery;
  images: CustomerBridgeImage[];
  initialDraft?: CustomerBridgeDraft | null;
  initialSelection?: { items?: Array<{ image_id: string; customer_rating?: number | null; customer_color_label?: number | null; memo?: string | null }>; customer_memo?: string | null } | null;
  onSubmitted: (selection: unknown) => void;
  apiBase?: string;
  storageScope?: string;
  readOnly?: boolean;
  embedded?: boolean;
  refreshImageUrl?: (imageId: string) => Promise<Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>;
  loadImageUrls?: (imageIds: string[], options?: { variant: SelectionMediaVariant }) => Promise<Record<string, SelectionMediaUrls>>;
  reviewer?: { display_name: string; role_label?: string | null; can_finalize?: boolean; can_download_jpg?: boolean; can_download_raw?: boolean } | null;
  messagesEnabled?: boolean;
  qualityApi?: string;
  canManageQuality?: boolean;
  adminToolbarAction?: ReactNode;
  adminToolbarStatus?: ReactNode;
}) {
  const endpointBase = apiBase ?? `/api/select/${shareToken}`;
  const localStorageScope = storageScope ?? shareToken;
  const { images, imageIds, imageById, handleImageError, requestMedia } = useCustomerBridgeMediaStore({
    initialImages,
    refreshImageUrl,
    loadImageUrls,
  });
  const seedMarks = useMemo(() => normalizeCustomerBridgeSelectionMarks({
    selectedImageIds: initialDraft?.selectedImageIds ?? (initialSelection?.items ?? []).map((item) => item.image_id),
    ratings: initialDraft?.ratings
      ?? Object.fromEntries((initialSelection?.items ?? []).map((item) => [item.image_id, item.customer_rating ?? 0])),
    colorLabels: initialDraft?.colorLabels
      ?? Object.fromEntries((initialSelection?.items ?? []).map((item) => [item.image_id, item.customer_color_label ?? 0])),
    allowedImageIds: imageIds,
  }), [imageIds, initialDraft, initialSelection]);
  const seedNotes = useMemo(() => initialDraft?.imageNotes
    ?? Object.fromEntries((initialSelection?.items ?? []).filter((item) => item.memo).map((item) => [item.image_id, item.memo ?? ""])), [initialDraft, initialSelection]);

  // 포커스/작업 대상/고객 셀렉은 서로 독립된 상태다.
  const [serverRatings, setServerRatings] = useState<Record<string, CustomerBridgeRating>>(seedMarks.ratings);
  const [serverColorLabels, setServerColorLabels] = useState<Record<string, CustomerBridgeColorLabel>>(seedMarks.colorLabels);
  const [serverNotes, setServerNotes] = useState<Record<string, string>>(seedNotes);
  const [customerRatings, setCustomerRatings] = useState<Record<string, CustomerBridgeRating>>(seedMarks.ratings);
  const [customerColorLabels, setCustomerColorLabels] = useState<Record<string, CustomerBridgeColorLabel>>(seedMarks.colorLabels);
  const [notes, setNotes] = useState<Record<string, string>>(seedNotes);
  const [filter, setFilter] = useState<PhotoFilter>("all");
  const [labelFilters, setLabelFilters] = useState<BridgeLabelFilters>(() => ({ ...EMPTY_BRIDGE_LABEL_FILTERS }));
  const [filenameSearch, setFilenameSearch] = useState("");
  const [thumbSize, setThumbSize] = useState(156);
  const [folderWidth, setFolderWidth] = useState(210);
  const [previewWidth, setPreviewWidth] = useState(320);
  const [compactFoldersOpen, setCompactFoldersOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [renderLimit, setRenderLimit] = useState(PAGE_SIZE);
  const [mobile, setMobile] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const revisionRef = useRef(initialDraft?.revision ?? 0);
  const serverSnapshotRef = useRef<SharedSelectionSyncSnapshot>({
    revision: initialDraft?.revision ?? 0,
    selectedImageIds: [...customerBridgeSelectedIds(seedMarks.ratings, seedMarks.colorLabels)],
    ratings: seedMarks.ratings,
    colorLabels: seedMarks.colorLabels,
    imageNotes: seedNotes,
    customerMemo: initialDraft?.customerMemo ?? initialSelection?.customer_memo ?? "",
    updatedAt: initialDraft?.updatedAt ?? null,
  });
  const requestKeyRef = useRef(createRequestKey());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  const resetButtonRef = useRef<HTMLButtonElement>(null);

  const { qualityResults, qualityJob, qualityState, startQuality, controlQuality, reviewQuality } = useCustomerBridgeQuality({
    qualityApi,
    canManageQuality,
  });

  const installServerSnapshot = useCallback((snapshot: SharedSelectionSyncSnapshot, pending: SelectionSyncDiff[]) => {
    const normalized = normalizeCustomerBridgeSelectionMarks({
      selectedImageIds: snapshot.selectedImageIds,
      ratings: snapshot.ratings,
      colorLabels: snapshot.colorLabels,
      allowedImageIds: imageIds,
    });
    const imageNotes = Object.fromEntries(Object.entries(snapshot.imageNotes ?? {}).filter(([imageId]) => imageIds.has(imageId)));
    const canonical: SharedSelectionSyncSnapshot = {
      revision: Number(snapshot.revision ?? 0),
      selectedImageIds: [...customerBridgeSelectedIds(normalized.ratings, normalized.colorLabels)],
      ratings: normalized.ratings,
      colorLabels: normalized.colorLabels,
      imageNotes,
      customerMemo: typeof snapshot.customerMemo === "string" ? snapshot.customerMemo : "",
      updatedAt: snapshot.updatedAt ?? null,
    };
    serverSnapshotRef.current = canonical;
    revisionRef.current = canonical.revision;
    setServerRatings(canonical.ratings as Record<string, CustomerBridgeRating>);
    setServerColorLabels(canonical.colorLabels as Record<string, CustomerBridgeColorLabel>);
    setServerNotes(canonical.imageNotes);
    const displayed = applySelectionDiffsToSharedSnapshot(canonical, pending);
    setCustomerRatings(displayed.ratings as Record<string, CustomerBridgeRating>);
    setCustomerColorLabels(displayed.colorLabels as Record<string, CustomerBridgeColorLabel>);
    setNotes(displayed.imageNotes);
  }, [imageIds]);

  const restorePending = useCallback((pending: SelectionSyncDiff[]) => {
    const displayed = applySelectionDiffsToSharedSnapshot(serverSnapshotRef.current, pending);
    setCustomerRatings(displayed.ratings as Record<string, CustomerBridgeRating>);
    setCustomerColorLabels(displayed.colorLabels as Record<string, CustomerBridgeColorLabel>);
    setNotes(displayed.imageNotes);
  }, []);

  const sendSelectionDiffs = useCallback(async ({ clientId, diffs }: { clientId: string; diffs: SelectionSyncDiff[] }) => {
    return sendSelectionSyncBatch<SharedSelectionSyncSnapshot>({
      endpoint: `${endpointBase}/draft`,
      clientId,
      diffs,
      responseKey: "draft",
    });
  }, [endpointBase]);

  const selectionSync = useSelectionSyncQueue({
    storageKey: `person-select-sync:${localStorageScope}`,
    enabled: !readOnly,
    sendBatch: sendSelectionDiffs,
    onSnapshot: installServerSnapshot,
    onRestore: restorePending,
  });
  const getPendingSelectionDiffs = selectionSync.getPendingDiffs;

  useEffect(() => {
    if (!initialDraft || Number(initialDraft.revision ?? 0) <= serverSnapshotRef.current.revision) return;
    installServerSnapshot(initialDraft as SharedSelectionSyncSnapshot, getPendingSelectionDiffs());
  }, [getPendingSelectionDiffs, initialDraft, installServerSnapshot]);

  const applyRatingTo = useCallback((targetIds: ReadonlySet<string>, rating: 0 | CustomerBridgeRating) => {
    if (readOnly || !targetIds.size) return;
    if (rating === 0) {
      setCustomerRatings((current) => clearCustomerBridgeMarks(current, targetIds));
      setCustomerColorLabels((current) => clearCustomerBridgeMarks(current, targetIds));
      selectionSync.enqueue([...targetIds].flatMap((imageId) => [
        { imageId, rating: null },
        { imageId, colorLabel: null },
      ]));
    } else {
      setCustomerRatings((current) => applyCustomerRatings(current, targetIds, rating));
      selectionSync.enqueue([...targetIds].map((imageId) => ({ imageId, rating })));
    }
  }, [readOnly, selectionSync]);

  const applyColorTo = useCallback((targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => {
    if (readOnly || !targetIds.size) return;
    setCustomerColorLabels((current) => applyCustomerColorLabels(current, targetIds, colorLabel));
    selectionSync.enqueue([...targetIds].map((imageId) => ({ imageId, colorLabel })));
  }, [readOnly, selectionSync]);

  const toggleColorTo = useCallback((targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => {
    if (readOnly || !targetIds.size) return;
    setCustomerColorLabels((current) => toggleCustomerColorLabels(current, targetIds, colorLabel));
    selectionSync.enqueue([...targetIds].map((imageId) => ({
      imageId,
      colorLabel: customerColorLabels[imageId] === colorLabel ? null : colorLabel,
    })));
  }, [customerColorLabels, readOnly, selectionSync]);

  const locationSelectionResetRef = useRef<(images: readonly CustomerBridgeImage[]) => void>(() => undefined);
  const fullscreenOpenRef = useRef<(imageId: string) => void>(() => undefined);
  const {
    location,
    folderTree,
    rootView,
    folderView,
    folderImages,
    childFolders,
    openLocation,
    goToParentFolder,
  } = useCustomerBridgeLocation({
    images,
    storageScope: localStorageScope,
    onLocationOpened: (nextImages) => locationSelectionResetRef.current(nextImages),
    onStorageError: reportOptionalStorageError,
  });
  const serverSelectedIds = useMemo(() => customerBridgeSelectedIds(serverRatings, serverColorLabels), [serverColorLabels, serverRatings]);
  const { downloadState, downloadBusy, downloadSelected } = useCustomerBridgeDownload({
    endpointBase,
    readOnly,
    pendingCount: selectionSync.pendingCount,
    selectedIds: serverSelectedIds,
  });
  // 화면은 즉시 반응하되 미저장 사진에는 pending 표시를 남기고, 제출은 저장 완료 뒤에만 허용한다.
  const customerSelectedIds = useMemo(() => customerBridgeSelectedIds(customerRatings, customerColorLabels), [customerColorLabels, customerRatings]);
  const { visibleImages, selectedInFolder, qualityCounts, searchActive } = useMemo(() => buildCustomerBridgePhotoView({
    images: folderImages,
    filter,
    filenameSearch,
    labelFilters,
    selectedIds: customerSelectedIds,
    ratings: customerRatings,
    colorLabels: customerColorLabels,
    qualityResults,
  }), [customerColorLabels, customerRatings, customerSelectedIds, filenameSearch, filter, folderImages, labelFilters, qualityResults]);
  const orderedIds = useMemo(() => visibleImages.map((image) => image.id), [visibleImages]);
  const openMobileImage = useCallback((imageId: string) => fullscreenOpenRef.current(imageId), []);
  const {
    focusedImageId,
    setFocusedImageId,
    activeImageIds,
    setActiveImageIds,
    anchorId,
    setAnchorId,
    marquee,
    resetLocationSelection,
    clearActiveSelection,
    handlePhotoClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useCustomerBridgeActiveSelection({
    orderedIds,
    mobile,
    readOnly,
    gridRef,
    onMobileOpen: openMobileImage,
  });
  locationSelectionResetRef.current = (nextImages) => {
    resetLocationSelection(nextImages);
    setCompactFoldersOpen(false);
  };
  const renderedImages = useMemo(() => visibleImages.slice(0, renderLimit), [renderLimit, visibleImages]);
  const focusedImage = focusedImageId ? imageById.get(focusedImageId) ?? null : null;
  const {
    fullscreenId,
    fullscreenImage,
    fullscreenIndex,
    zoomed,
    openFullscreen,
    closeFullscreen,
    toggleFullscreenZoom,
    moveFullscreen,
    reviewIds,
    reviewActiveId,
    reviewRemoved,
    reviewImages,
    setReviewActiveId,
    openReview,
    closeReview,
    resetReview,
    moveReview,
    removeFromReview,
    restoreReview,
  } = useCustomerBridgeReviewController({
    images,
    visibleImages,
    imageById,
    selectedIds: customerSelectedIds,
    focusedImageId,
    ratings: customerRatings,
    colorLabels: customerColorLabels,
    onFocusImage: setFocusedImageId,
    onApplyRating: applyRatingTo,
    onApplyColor: applyColorTo,
  });
  useEffect(() => {
    fullscreenOpenRef.current = openFullscreen;
  }, [openFullscreen]);

  useCustomerBridgeMediaRequests({
    renderedImages,
    visibleImages,
    focusedImageId,
    fullscreenId,
    reviewImages,
    reviewActiveId,
    requestMedia,
  });

  const {
    sideTab,
    setSideTab,
    mobileSideOpen,
    setMobileSideOpen,
    messages,
    messageText,
    setMessageText,
    messageState,
    messageImageScoped,
    setMessageImageScoped,
    unreadMessages,
    sendingMessage,
    messagesEndRef,
    sendMessage,
  } = useCustomerBridgeMessages({
    endpointBase,
    enabled: messagesEnabled,
    mobile,
    focusedImageId,
  });

  const applyMainRating = useCallback((rating: 0 | CustomerBridgeRating) => {
    applyRatingTo(customerBridgeRatingTargets(activeImageIds, focusedImageId), rating);
  }, [activeImageIds, applyRatingTo, focusedImageId]);

  const applyMainColor = useCallback((colorLabel: CustomerBridgeColorLabel) => {
    toggleColorTo(customerBridgeRatingTargets(activeImageIds, focusedImageId), colorLabel);
  }, [activeImageIds, focusedImageId, toggleColorTo]);

  const refreshServerDraft = useCallback(async () => {
    if (readOnly) return;
    try {
      const response = await fetch(`${endpointBase}/draft`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.draft) return;
      installServerSnapshot(result.draft as SharedSelectionSyncSnapshot, getPendingSelectionDiffs());
    } catch {
      // 현재 큐를 지우지 않는다. 다음 focus 또는 자동 재시도 때 다시 동기화한다.
    }
  }, [endpointBase, getPendingSelectionDiffs, installServerSnapshot, readOnly]);

  useVisibleSelectionRefresh({ enabled: !readOnly, refresh: refreshServerDraft });

  const closeResetConfirm = useCallback(() => {
    if (resetting) return;
    setResetConfirmOpen(false);
    requestAnimationFrame(() => resetButtonRef.current?.focus());
  }, [resetting]);

  const resetSelection = useCallback(async () => {
    if (readOnly || resetting) return;
    setResetting(true);
    try {
      const affectedIds = new Set([
        ...Object.keys(customerRatings),
        ...Object.keys(customerColorLabels),
        ...Object.keys(notes),
        ...Object.keys(serverRatings),
        ...Object.keys(serverColorLabels),
        ...Object.keys(serverNotes),
      ]);
      const patches: SelectionSyncPatch[] = [...affectedIds].flatMap((imageId) => [
        { imageId, rating: null },
        { imageId, colorLabel: null },
        { imageId, memo: "" },
      ]);
      selectionSync.enqueue(patches);
      setCustomerRatings({});
      setCustomerColorLabels({});
      setNotes({});
      const saved = await selectionSync.flushNow();
      if (!saved) throw new Error("초기화 내용을 저장하지 못했습니다. 자동 재시도합니다.");
      clearActiveSelection();
      resetReview();
      setFilter("all");
      setSubmitError("");
      setResetConfirmOpen(false);
      requestAnimationFrame(() => resetButtonRef.current?.focus());
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "셀렉을 초기화하지 못했습니다.");
    } finally {
      setResetting(false);
    }
  }, [clearActiveSelection, customerColorLabels, customerRatings, notes, readOnly, resetReview, resetting, selectionSync, serverColorLabels, serverNotes, serverRatings]);

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
    const root = gridRef.current;
    if (!node || !root || renderLimit >= visibleImages.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setRenderLimit((current) => Math.min(visibleImages.length, current + PAGE_SIZE));
    }, { root, rootMargin: "700px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [renderLimit, visibleImages.length]);

  useEffect(() => {
    setRenderLimit(PAGE_SIZE);
    gridRef.current?.scrollTo({ top: 0 });
  }, [filenameSearch, filter, labelFilters, location]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    requestAnimationFrame(() => guideButtonRef.current?.focus());
  }, []);

  const applyLabelFilterCommand = useCallback((command: BridgeLabelFilterCommand) => {
    if (fullscreenId) closeFullscreen();
    if (command.kind === "all") {
      setLabelFilters({ ...EMPTY_BRIDGE_LABEL_FILTERS });
      setFilter("all");
      return;
    }
    setLabelFilters((current) => updateBridgeLabelFilters(current, command));
  }, [closeFullscreen, fullscreenId]);

  const handleSearchFilterShortcut = useBridgeSearchFilterShortcuts({
    searchInputRef,
    searchQuery: filenameSearch,
    onSearchQueryChange: setFilenameSearch,
    onFilterCommand: applyLabelFilterCommand,
  });

  useCustomerBridgeKeyboard({
    guideOpen,
    resetConfirmOpen,
    mobileSideOpen,
    closeGuide,
    closeResetConfirm,
    handleSearchFilterShortcut,
    fullscreenId,
    closeFullscreen,
    openFullscreen,
    moveFullscreen,
    reviewIds,
    reviewActiveId,
    reviewRemoved,
    openReview,
    closeReview,
    moveReview,
    removeFromReview,
    restoreReview,
    readOnly,
    activeImageIds,
    focusedImageId,
    orderedIds,
    anchorId,
    customerRatings,
    customerColorLabels,
    applyRatingTo,
    toggleColorTo,
    setActiveImageIds,
    setAnchorId,
    setFocusedImageId,
    setMobileSideOpen,
    setCompactFoldersOpen,
    gridRef,
    thumbSize,
  });

  const beginResize = (pane: "folder" | "preview", event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const start = pane === "folder" ? folderWidth : previewWidth;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (pane === "folder") setFolderWidth(Math.max(160, Math.min(340, start + delta)));
      else setPreviewWidth(Math.max(250, Math.min(520, start - delta)));
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };

  const openSubmitReview = async () => {
    const selectedCount = customerSelectedIds.size;
    if (!selectedCount || submitting || selectionSync.pendingCount) return;
    setSubmitError("");
    const saved = await selectionSync.flushNow();
    if (!saved) return;
    setSubmitReviewOpen(true);
  };

  const submit = async () => {
    if (!customerSelectedIds.size || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch(`${endpointBase}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: revisionRef.current, requestKey: requestKeyRef.current, confirmed: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error ?? "최종 제출에 실패했습니다.");
      requestKeyRef.current = createRequestKey();
      try { localStorage.removeItem(`customer-bridge-submit-key:${localStorageScope}`); } catch (error) { reportOptionalStorageError("submit-key-clear", error); }
      onSubmitted(result.selection);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "최종 제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReviewItems = useMemo(() => {
    if (!submitReviewOpen) return [];
    const items = [];
    for (const image of images) {
      if (!customerSelectedIds.has(image.id)) continue;
      const detail = [
        customerRatings[image.id] ? `★${customerRatings[image.id]}` : "",
        customerColorLabels[image.id] ? BRIDGE_COLOR_LABELS[customerColorLabels[image.id]].name : "",
        notes[image.id]?.trim() ? "보정 메모 있음" : "",
      ].filter(Boolean).join(" · ");
      items.push({ id: image.id, fileName: image.original_file_name, thumbnailUrl: image.thumbnail_url || image.image_url, detail });
      if (items.length === 12) break;
    }
    return items;
  }, [customerColorLabels, customerRatings, customerSelectedIds, images, notes, submitReviewOpen]);
  const submitReviewSections = useMemo(() => {
    if (!submitReviewOpen) return [];
    let ratingCount = 0;
    let colorCount = 0;
    let memoCount = 0;
    for (const id of customerSelectedIds) {
      if (customerRatings[id]) ratingCount += 1;
      if (customerColorLabels[id]) colorCount += 1;
      if (notes[id]?.trim()) memoCount += 1;
    }
    return [
      { label: "별점 셀렉", count: ratingCount },
      { label: "컬러 셀렉", count: colorCount },
      { label: "보정 메모", count: memoCount },
    ];
  }, [customerColorLabels, customerRatings, customerSelectedIds, notes, submitReviewOpen]);

  const workspaceStyle = { "--bridge-folder-width": `${folderWidth}px`, "--bridge-preview-width": `${previewWidth}px` } as CSSProperties;
  const locationLabel = location.kind === "root" ? "프로젝트" : location.kind === "all" ? "전체 사진" : location.path || "루트 사진";
  const locationCount = location.kind === "root" ? childFolders.length + (rootView.images.length ? 1 : 0) : visibleImages.length;
  const activeRatingFilterName = labelFilters.rating === null
    ? null
    : bridgeLabelFilterName({ kind: "rating", rating: labelFilters.rating });
  const activeColorFilterName = labelFilters.color === null
    ? null
    : bridgeLabelFilterName({ kind: "color", label: labelFilters.color });
  const saveStatusMessage = readOnly
    ? "관리자 사진 확인"
    : selectionSync.status === "saved"
      ? selectionSync.lastSavedAt ? "저장됨 · 방금" : "저장됨"
      : selectionSync.status === "saving"
        ? "저장 중…"
        : selectionSync.status === "waiting"
          ? `저장 안 된 변경 ${selectionSync.pendingCount}건 · 잠시 후 저장`
          : selectionSync.status === "retrying"
            ? `저장 안 된 변경 ${selectionSync.pendingCount}건 · 잠시 후 자동 저장`
          : `저장 안 된 변경 ${selectionSync.pendingCount}건 · 다시 시도`;

  return <main className={`${styles.page} ${embedded ? styles.embedded : ""} ${readOnly ? styles.readOnly : ""} ${adminToolbarStatus ? styles.withAdminToolbarStatus : ""}`}>
    <header className={styles.bridgeBar}>
      <div><strong>Olivia Bridge</strong><span>고객 사진 셀렉</span></div>
      <div className={styles.projectTitle}><strong>{gallery.shooting_name ?? gallery.title}</strong><span>{[reviewer ? `${reviewer.display_name}${reviewer.role_label ? ` · ${reviewer.role_label}` : ""}` : gallery.hospital_name, `${images.length.toLocaleString("ko-KR")}장`].filter(Boolean).join(" · ")}</span></div>
      <div className={styles.saveState} data-state={selectionSync.status}>{saveStatusMessage}</div>
    </header>

    <div className={styles.pathBar}>
      <button type="button" className={styles.mobileFolderButton} aria-expanded={compactFoldersOpen} onClick={() => setCompactFoldersOpen(true)}><PanelLeft size={15} /> 폴더</button>
      <button type="button" className={styles.backButton} disabled={location.kind === "root"} onClick={goToParentFolder} aria-label="상위 폴더로"><ChevronLeft size={16} /></button>
      <nav className={styles.breadcrumbs} aria-label="현재 폴더">
        <FolderOpen size={15} />
        <button type="button" aria-current={location.kind === "root" ? "page" : undefined} onClick={() => openLocation({ kind: "root" })}>{gallery.title}</button>
        {location.kind === "all" ? <><ChevronRight size={12} /><strong>전체 사진</strong></> : null}
        {location.kind === "folder" && !location.path ? <><ChevronRight size={12} /><strong>루트 사진</strong></> : null}
        {location.kind === "folder" ? folderView?.breadcrumbs.map((crumb, index) => <span key={crumb.path}><ChevronRight size={12} /><button type="button" aria-current={index === (folderView?.breadcrumbs.length ?? 0) - 1 ? "page" : undefined} onClick={() => openLocation({ kind: "folder", path: crumb.path })}>{crumb.name}</button></span>) : null}
      </nav>
      {location.kind !== "root" ? <div className={styles.topFilters} aria-label="고객 셀렉 필터">
        {(["all", "selected", "unselected"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? `전체 ${folderImages.length}` : value === "selected" ? `고객 셀렉 ${selectedInFolder}` : `미선택 ${folderImages.length - selectedInFolder}`}</button>)}
      </div> : null}
      <button ref={guideButtonRef} type="button" className={`${styles.headerAction} ${styles.guideAction}`} title="사진 선택 이용 가이드" aria-haspopup="dialog" aria-expanded={guideOpen} onClick={() => setGuideOpen(true)}><BookOpenText size={14} /> 이용 가이드</button>
      {gallery.download_jpg_enabled && !readOnly ? <button type="button" className={styles.headerAction} disabled={!serverSelectedIds.size || downloadBusy || selectionSync.pendingCount > 0} title={downloadState || "고객 셀렉 원본 JPG를 ZIP으로 준비합니다."} onClick={() => void downloadSelected("jpg")}><Download size={14} /> {downloadBusy ? "준비 중" : "JPG 원본"}</button> : null}
      {gallery.download_raw_enabled && !readOnly ? <button type="button" className={styles.headerAction} disabled={!serverSelectedIds.size || downloadBusy || selectionSync.pendingCount > 0} title={downloadState || "고객 셀렉 RAW를 ZIP으로 준비합니다."} onClick={() => void downloadSelected("raw")}><Download size={14} /> {downloadBusy ? "준비 중" : "RAW 원본"}</button> : null}
      {messagesEnabled ? <button type="button" className={`${styles.headerAction} ${styles.mobileChatAction}`} onClick={() => { setSideTab("chat"); setMobileSideOpen(true); }}><MessageCircle size={14} /> 대화{unreadMessages ? ` ${unreadMessages}` : ""}</button> : null}
      {qualityApi && canManageQuality ? <button type="button" className={styles.headerAction} disabled={["queued", "running", "paused"].includes(String(qualityJob?.status ?? ""))} onClick={() => void startQuality()}><Sparkles size={14} /> {["queued", "running"].includes(String(qualityJob?.status ?? "")) ? "AI 검사 중" : qualityJob?.status === "paused" ? "AI 검사 정지" : "AI 검사 시작"}</button> : null}
      {adminToolbarAction}
      <button type="button" className={styles.headerAction} disabled={!customerSelectedIds.size} onClick={openReview}><Images size={14} /> 리뷰</button>
      <button type="button" className={styles.headerAction} disabled={!focusedImageId} onClick={() => focusedImageId && openFullscreen(focusedImageId)}><Expand size={14} /> 전체화면</button>
    </div>

    {adminToolbarStatus ? <div className={styles.adminToolbarStatus}>{adminToolbarStatus}</div> : null}

    <section className={styles.workspace} style={workspaceStyle}>
      {compactFoldersOpen ? <button type="button" className={styles.folderBackdrop} aria-label="폴더 닫기" onClick={() => setCompactFoldersOpen(false)} /> : null}
      <aside className={styles.folderPanel} data-compact-open={compactFoldersOpen || undefined}>
        <div className={styles.panelTitle}><span>폴더</span><button type="button" onClick={() => setCompactFoldersOpen(false)} aria-label="폴더 닫기"><X size={15} /></button></div>
        <div className={styles.folderPanelScroll}>
        <button type="button" className={location.kind === "root" ? styles.rootFolderActive : styles.rootFolder} onClick={() => openLocation({ kind: "root" })}><FolderOpen size={17} /><span>프로젝트</span><b>{rootView.folders.length}</b></button>
        <button type="button" className={`${styles.rootFolder} ${location.kind === "all" ? styles.rootFolderActive : ""}`} onClick={() => openLocation({ kind: "all" })}><Images size={17} /><span>전체 사진</span><b>{images.length}</b></button>
        <div className={styles.folderList}>
          {rootView.images.length ? <button type="button" className={location.kind === "folder" && location.path === "" ? styles.activeFolder : ""} onClick={() => openLocation({ kind: "folder", path: "" })}><FolderOpen size={15} /><span>루트 사진</span><b>{rootView.images.length}</b></button> : null}
          {folderTree.map((folder) => <button key={folder.path} type="button" className={location.kind === "folder" && location.path === folder.path ? styles.activeFolder : ""} style={{ "--folder-depth": folder.depth } as CSSProperties} onClick={() => openLocation({ kind: "folder", path: folder.path })}><Folder size={15} /><span>{folder.name}</span><b>{folder.totalCount}</b></button>)}
        </div>
        <div className={styles.filterList}><small>고객 셀렉</small>{(["all", "selected", "unselected"] as const).map((value) => <button key={value} type="button" className={filter === value ? styles.activeFilter : ""} disabled={location.kind === "root"} onClick={() => setFilter(value)}><span>{value === "all" ? "전체 사진" : value === "selected" ? "선택한 사진" : "선택하지 않은 사진"}</span><b>{location.kind === "root" ? "–" : value === "all" ? folderImages.length : value === "selected" ? selectedInFolder : folderImages.length - selectedInFolder}</b></button>)}</div>
        {qualityApi ? <div className={styles.filterList}><small>AI 품질 검사</small>{([
          ["eyes_closed", "눈감음 의심"],
          ["face_too_dark", "얼굴 어두움 의심"],
          ["motion_blur", "흔들림 의심"],
          ["quality_review", "확인 필요"],
          ["quality_normal", "정상"],
        ] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? styles.activeFilter : ""} disabled={location.kind === "root"} onClick={() => setFilter(value)}><span>{label}</span><b>{location.kind === "root" ? "–" : qualityCounts[value]}</b></button>)}{qualityState ? <p className={styles.qualityState}>{qualityState}</p> : null}<PhotoQualityJobProgressView job={qualityJob} tone="light" />{canManageQuality && qualityJob && ["queued", "running"].includes(String(qualityJob.status ?? "")) ? <button type="button" onClick={() => void controlQuality("pause")}><span>검사 일시정지</span></button> : null}{canManageQuality && qualityJob?.status === "paused" ? <button type="button" onClick={() => void controlQuality("resume")}><span>검사 계속</span></button> : null}{canManageQuality && qualityJob && ["failed", "partial_failed"].includes(String(qualityJob.status ?? "")) ? <button type="button" onClick={() => void controlQuality("retry")}><span>실패 사진 재시도</span></button> : null}</div> : null}
        </div>
        <div className={styles.folderSummary}><span>전체<b>{images.length}</b></span><span>작업 대상<b>{activeImageIds.size}</b></span><span>고객 셀렉<b>{customerSelectedIds.size}</b></span></div>
      </aside>

      <button type="button" className={styles.paneDivider} aria-label="폴더 패널 너비 조절" onPointerDown={(event) => beginResize("folder", event)} />

      <section className={styles.browserPanel}>
        <header className={styles.browserHeader}>
          <div className={styles.browserTitle}>
            <strong>{locationLabel}</strong>
            <span>{location.kind === "root" ? `${locationCount}개 폴더` : searchActive ? `검색 ${visibleImages.length.toLocaleString("ko-KR")}장` : `${visibleImages.length.toLocaleString("ko-KR")}장`}</span>
            {activeRatingFilterName ? <button type="button" className={styles.filterChip} onClick={() => applyLabelFilterCommand({ kind: "rating", rating: labelFilters.rating! })}>{activeRatingFilterName}<X size={11} /></button> : null}
            {activeColorFilterName ? <button type="button" className={styles.filterChip} onClick={() => applyLabelFilterCommand({ kind: "color", label: labelFilters.color! })}>{activeColorFilterName}<X size={11} /></button> : null}
          </div>
          {location.kind !== "root" ? <div className={styles.browserActions}>
            <label className={styles.filenameSearch}>
              <Search size={13} aria-hidden="true" />
              <input ref={searchInputRef} type="search" value={filenameSearch} onChange={(event) => setFilenameSearch(event.currentTarget.value)} placeholder="파일명 검색" aria-label="파일명 검색" />
              {filenameSearch ? <button type="button" onClick={() => { setFilenameSearch(""); searchInputRef.current?.focus(); }} aria-label="검색 지우기"><X size={12} /></button> : <kbd>⌘F</kbd>}
            </label>
            <div className={styles.thumbnailControls}><button type="button" onClick={() => setThumbSize((size) => Math.max(THUMB_MIN, size - 12))} aria-label="썸네일 작게"><Minus size={15} /></button><LayoutGrid size={16} /><button type="button" onClick={() => setThumbSize((size) => Math.min(THUMB_MAX, size + 12))} aria-label="썸네일 크게"><Plus size={15} /></button></div>
          </div> : null}
        </header>
        <div ref={gridRef} className={styles.fileArea} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
          {childFolders.length || (location.kind === "root" && rootView.images.length) ? <div className={styles.folderCardGrid}>
            {location.kind === "root" && rootView.images.length ? <button type="button" className={styles.folderCard} onClick={() => openLocation({ kind: "folder", path: "" })}>
              <span className={styles.folderCardMedia}><Folder size={24} /></span><span><strong>루트 사진</strong><small>{rootView.images.length.toLocaleString("ko-KR")}장</small></span>
            </button> : null}
            {childFolders.map((folder) => <button type="button" key={folder.path} className={styles.folderCard} onClick={() => openLocation({ kind: "folder", path: folder.path })}>
              <span className={styles.folderCardMedia}><Folder size={24} /></span><span><strong>{folder.name}</strong><small>{folder.totalCount.toLocaleString("ko-KR")}장</small></span>
            </button>)}
          </div> : null}
          <div className={styles.thumbnailGrid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}>
            {renderedImages.map((image) => {
              const active = activeImageIds.has(image.id);
              const focused = focusedImageId === image.id;
              const rating = customerRatings[image.id] ?? 0;
              const colorLabel = customerColorLabels[image.id] ?? null;
              return <CustomerBridgeThumbnailCard key={image.id} image={image} active={active} focused={focused} rating={rating} colorLabel={colorLabel} pending={selectionSync.pendingImageIds.has(image.id)} mobile={mobile} quality={qualityResults[image.id]} onClick={handlePhotoClick} onImageError={handleImageError} />;
            })}
          </div>
          {location.kind !== "root" && !visibleImages.length && !childFolders.length ? <div className={styles.empty}>이 폴더에 표시할 사진이 없습니다.</div> : null}
          {marquee ? <div className={styles.selectionMarquee} style={marquee} /> : null}<div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
        </div>
        <footer className={styles.shortcutBar}><span>{activeRatingFilterName ? <b className={styles.shortcutActiveFilter}>{activeRatingFilterName}</b> : null}{activeColorFilterName ? <b className={styles.shortcutActiveFilter}>{activeColorFilterName}</b> : null}클릭 작업 대상 · Shift 범위 · ⌘/Ctrl 추가 · 1–5 별점 · 6–9 컬러 · 0 해제 · ⌘/Ctrl+B 리뷰 · ⌥⌘숫자 필터 · ⌥⌘A 전체 · ⌘F 검색</span>{location.kind !== "root" ? <label>썸네일 <input type="range" min={THUMB_MIN} max={THUMB_MAX} step={4} value={thumbSize} onChange={(event) => setThumbSize(Number(event.currentTarget.value))} /></label> : null}</footer>
      </section>

      <button type="button" className={styles.paneDivider} aria-label="미리보기 패널 너비 조절" onPointerDown={(event) => beginResize("preview", event)} />

      <aside className={styles.previewPanel} data-mobile-open={mobileSideOpen || undefined}>
        <nav className={styles.sideTabs} role="tablist" aria-label="오른쪽 패널">
          <button type="button" role="tab" aria-selected={sideTab === "preview"} onClick={() => setSideTab("preview")}>미리보기</button>
          {messagesEnabled ? <button type="button" role="tab" aria-selected={sideTab === "chat"} onClick={() => setSideTab("chat")}><MessageCircle size={14} />대화{unreadMessages ? <b>{unreadMessages}</b> : null}</button> : null}
          <button type="button" className={styles.mobileSideClose} onClick={() => setMobileSideOpen(false)} aria-label="오른쪽 패널 닫기"><X size={16} /></button>
        </nav>
        {sideTab === "preview" ? <div className={styles.previewContent}>
          <header><strong>미리보기</strong><span>{activeImageIds.size ? `작업 대상 ${activeImageIds.size}장` : focusedImage ? "현재 사진" : "사진을 선택해 주세요"}</span></header>
          {focusedImage ? <><div className={styles.previewCanvas} onDoubleClick={() => openFullscreen(focusedImage.id)}><button type="button" className={`${styles.previewArrow} ${styles.previewArrowLeft}`} onClick={() => { const index = orderedIds.indexOf(focusedImage.id); const next = orderedIds[Math.max(0, index - 1)]; if (next) setFocusedImageId(next); }} disabled={orderedIds.indexOf(focusedImage.id) <= 0} aria-label="이전 사진"><ChevronLeft size={20} /></button><StablePreviewImage image={focusedImage} onImageError={handleImageError} /><button type="button" className={`${styles.previewArrow} ${styles.previewArrowRight}`} onClick={() => { const index = orderedIds.indexOf(focusedImage.id); const next = orderedIds[Math.min(orderedIds.length - 1, index + 1)]; if (next) setFocusedImageId(next); }} disabled={orderedIds.indexOf(focusedImage.id) >= orderedIds.length - 1} aria-label="다음 사진"><ChevronRight size={20} /></button></div>
            <div className={styles.previewMeta}><strong>{focusedImage.original_file_name}</strong><span>{focusedImage.relative_path ?? ""}</span><button type="button" onClick={() => openFullscreen(focusedImage.id)}><Expand size={13} /> 크게 보기</button></div>
            {qualityResults[focusedImage.id] ? <section className={styles.qualityPanel}><header><strong>AI 품질 분석</strong><span>{qualityResults[focusedImage.id].reviewStatus === "confirmed_normal" ? "정상 확인됨" : qualityResults[focusedImage.id].reviewStatus === "confirmed_issue" ? "문제 확인됨" : "검토 보조"}</span></header>{(["eyes_closed", "face_too_dark", "motion_blur"] as const).map((flag) => <div key={flag} data-suspected={qualityResults[focusedImage.id].flags.includes(flag) || undefined}><span>{flag === "eyes_closed" ? "눈감음" : flag === "face_too_dark" ? "얼굴 어두움" : "흔들림"}</span><b>{qualityResults[focusedImage.id].flags.includes(flag) ? "의심" : qualityResults[focusedImage.id].status === "needs_review" ? "확인 필요" : "정상"}</b></div>)}{canManageQuality ? <footer><button type="button" onClick={() => void reviewQuality(focusedImage.id, "confirmed_issue")}>문제 확인</button><button type="button" onClick={() => void reviewQuality(focusedImage.id, "confirmed_normal")}>정상으로 확인</button></footer> : null}<small>AI 결과는 별점·셀렉·파일을 자동 변경하지 않습니다.</small></section> : null}
            {!readOnly ? <div className={styles.previewControls}><div><span>{activeImageIds.size > 1 ? `${activeImageIds.size}장에 셀렉 적용` : "고객 셀렉"}</span><RatingStars value={customerRatings[focusedImage.id] ?? 0} onChange={applyMainRating} /><ColorLabels value={customerColorLabels[focusedImage.id] ?? null} onChange={applyMainColor} /></div><label>사진별 보정 메모<textarea value={notes[focusedImage.id] ?? ""} maxLength={1000} onChange={(event) => { const memo = event.target.value; setNotes((current) => ({ ...current, [focusedImage.id]: memo })); selectionSync.enqueue([{ imageId: focusedImage.id, memo }]); }} placeholder="이 사진에 필요한 보정 내용을 적어주세요." /></label></div> : <div className={styles.readOnlyMarks}>{customerRatings[focusedImage.id] ? <span><Star size={13} fill="currentColor" />{customerRatings[focusedImage.id]}점</span> : null}{customerColorLabels[focusedImage.id] ? <span><i style={{ background: BRIDGE_COLOR_LABELS[customerColorLabels[focusedImage.id]].color }} />{BRIDGE_COLOR_LABELS[customerColorLabels[focusedImage.id]].name}</span> : null}{notes[focusedImage.id] ? <p className={styles.readOnlyMemo}>{notes[focusedImage.id]}</p> : null}</div>}
          </> : <div className={styles.previewEmpty}><Images size={34} /><strong>미리 볼 사진을 선택해 주세요</strong></div>}
          </div> : <section className={styles.chatPanel} aria-label="프로젝트 대화">
          <div className={styles.messageList}>{messages.map((message) => <article key={message.id} data-own={message.own || undefined}><header><strong>{message.authorName}</strong>{message.authorRole ? <span>{message.authorRole}</span> : null}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></header>{message.imageId ? <button type="button" className={styles.messageImageLink} onClick={() => { setFocusedImageId(message.imageId); setSideTab("preview"); }}>{message.imageName || "연결 사진 보기"}</button> : null}<p>{message.body}</p></article>)}{!messages.length ? <div className={styles.chatEmpty}>프로젝트 사진에 관해 함께 이야기해 보세요.</div> : null}<div ref={messagesEndRef} /></div>
          {messagesEnabled ? <form className={styles.messageComposer} onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><label className={styles.messageScope}><input type="checkbox" checked={messageImageScoped} disabled={!focusedImageId} onChange={(event) => setMessageImageScoped(event.target.checked)} />{focusedImage ? `현재 사진 · ${focusedImage.original_file_name}` : "현재 사진 없음"}</label><textarea value={messageText} maxLength={2000} placeholder="메시지를 입력하세요" onChange={(event) => setMessageText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} /><button type="submit" disabled={!messageText.trim() || sendingMessage} aria-label="메시지 보내기"><Send size={16} /></button></form> : null}
          {messageState ? <p className={styles.messageState}>{messageState}</p> : null}
        </section>}
      </aside>
    </section>

    {!readOnly ? <footer className={styles.footer}><div className={styles.footerSummary}><strong>전체 {images.length.toLocaleString("ko-KR")}장 · 고객 셀렉 {customerSelectedIds.size.toLocaleString("ko-KR")}장</strong>{selectionSync.status === "error" ? <button type="button" className={styles.saveRetry} onClick={selectionSync.retry}>{saveStatusMessage}</button> : <span>{downloadState || submitError || (reviewer?.can_finalize === false ? `${saveStatusMessage} · 최종 확정 권한 없음` : saveStatusMessage)}</span>}</div><button ref={resetButtonRef} className={styles.resetButton} type="button" disabled={resetting || (!customerSelectedIds.size && !Object.keys(notes).length)} onClick={() => setResetConfirmOpen(true)}><RotateCcw size={14} /> 셀렉 초기화</button><button className={styles.reviewButton} type="button" disabled={!customerSelectedIds.size} onClick={openReview}>리뷰</button><button className={styles.submitButton} type="button" disabled={!customerSelectedIds.size || submitting || selectionSync.pendingCount > 0 || selectionSync.status !== "saved" || reviewer?.can_finalize === false} onClick={() => void openSubmitReview()}>{reviewer?.can_finalize === false ? "확정 권한 없음" : submitting ? "제출 중" : "제출하기"}</button></footer> : null}

    {fullscreenImage ? <PhotoOverlay image={fullscreenImage} index={fullscreenIndex} total={visibleImages.length} rating={customerRatings[fullscreenImage.id] ?? 0} colorLabel={customerColorLabels[fullscreenImage.id] ?? null} note={notes[fullscreenImage.id] ?? ""} zoomed={zoomed} onZoom={toggleFullscreenZoom} onClose={closeFullscreen} onPrev={() => moveFullscreen(-1)} onNext={() => moveFullscreen(1)} onRate={(rating) => applyRatingTo(new Set([fullscreenImage.id]), rating)} onColor={(colorLabel) => toggleColorTo(new Set([fullscreenImage.id]), colorLabel)} onNote={(value) => { setNotes((current) => ({ ...current, [fullscreenImage.id]: value })); selectionSync.enqueue([{ imageId: fullscreenImage.id, memo: value }]); }} onImageError={handleImageError} readOnly={readOnly} /> : null}
    {reviewIds ? <ReviewOverlay images={reviewImages} activeId={reviewActiveId} removed={reviewRemoved} ratings={customerRatings} colorLabels={customerColorLabels} onActive={setReviewActiveId} onClose={closeReview} onRemove={removeFromReview} onRestore={restoreReview} onRate={(id, rating) => rating === 0 ? removeFromReview(id) : applyRatingTo(new Set([id]), rating)} onColor={(id, colorLabel) => customerColorLabels[id] === colorLabel && !customerRatings[id] ? removeFromReview(id) : toggleColorTo(new Set([id]), colorLabel)} onFullscreen={openFullscreen} onImageError={handleImageError} /> : null}
    {guideOpen ? <CustomerBridgeGuideDialog onClose={closeGuide} /> : null}
    {resetConfirmOpen ? <CustomerBridgeResetDialog selectedCount={customerSelectedIds.size} resetting={resetting} onCancel={closeResetConfirm} onConfirm={() => void resetSelection()} /> : null}
    {submitReviewOpen ? <FinalSelectionSubmitDialog selectedCount={customerSelectedIds.size} sections={submitReviewSections} items={submitReviewItems} busy={submitting} error={submitError} onCancel={() => { if (!submitting) setSubmitReviewOpen(false); }} onConfirm={() => void submit()} /> : null}
  </main>;
}

function CustomerBridgeResetDialog({ selectedCount, resetting, onCancel, onConfirm }: {
  selectedCount: number;
  resetting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirmButtonRef.current?.focus(); }, []);

  return <div className={styles.resetBackdrop} onMouseDown={(event) => { if (!resetting && event.currentTarget === event.target) onCancel(); }}>
    <section ref={dialogRef} className={styles.resetDialog} role="alertdialog" aria-modal="true" aria-labelledby="customer-bridge-reset-title" aria-describedby="customer-bridge-reset-description" onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const first = cancelButtonRef.current;
      const last = confirmButtonRef.current;
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }}>
      <header><RotateCcw size={18} /><strong id="customer-bridge-reset-title">고객 셀렉을 초기화할까요?</strong></header>
      <p id="customer-bridge-reset-description">현재 선택한 {selectedCount.toLocaleString("ko-KR")}장의 별점·컬러와 사진별 보정 메모가 모두 지워지고 즉시 저장됩니다.</p>
      <small>기존 최종 제출 기록과 프로젝트 사진은 삭제하지 않습니다.</small>
      <footer><button ref={cancelButtonRef} type="button" disabled={resetting} onClick={onCancel}>취소</button><button ref={confirmButtonRef} type="button" disabled={resetting} onClick={onConfirm}>{resetting ? "초기화 중" : "셀렉 초기화"}</button></footer>
    </section>
  </div>;
}

function CustomerBridgeGuideDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className={styles.guideBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div ref={dialogRef} className={styles.guideDialog} role="dialog" aria-modal="true" aria-labelledby="customer-bridge-guide-title" onKeyDown={trapFocus}>
      <header className={styles.guideHeader}>
        <div><strong id="customer-bridge-guide-title">Olivia Bridge 사진 선택 가이드</strong><span>사진을 확인하고 마음에 드는 사진을 별점으로 선택해 주세요.</span></div>
        <button ref={closeButtonRef} type="button" aria-label="이용 가이드 닫기" onClick={onClose}><X size={19} /></button>
      </header>
      <div className={styles.guideBody}>
        <p className={styles.guideImportant}><AlertTriangle size={18} /><span><strong>사진을 클릭하는 것만으로는 최종 선택되지 않습니다.</strong> 사진을 작업 대상으로 지정한 다음 별점이나 컬러를 적용해야 고객 셀렉에 포함됩니다.</span></p>
        <ol className={styles.guideSteps}>
          <li><b>1</b><div><strong>폴더에서 사진 찾기</strong><p>왼쪽에서 촬영 폴더를 선택하세요. 모든 폴더의 사진을 함께 보려면 <em>전체 사진</em>을 누릅니다.</p></div></li>
          <li><b>2</b><div><strong>사진 확인하기</strong><p>사진을 클릭하면 오른쪽 미리보기에 크게 표시됩니다. 썸네일 크기 조절과 전체화면을 함께 사용할 수 있습니다.</p></div></li>
          <li><b>3</b><div><strong>별점과 컬러로 셀렉하기</strong><p><kbd>1</kbd>–<kbd>5</kbd>는 별점 셀렉, <kbd>6</kbd>–<kbd>9</kbd>는 컬러 셀렉입니다. 같은 컬러 키를 한 번 더 누르거나 <kbd>0</kbd>을 누르면 해당 표시가 해제됩니다.</p></div></li>
          <li><b>4</b><div><strong>여러 장 한 번에 작업하기</strong><p><kbd>Shift</kbd> 클릭은 연속 범위, <kbd>⌘ / Ctrl</kbd> 클릭은 떨어진 사진 추가, 빈 공간에서 드래그하면 여러 사진을 작업 대상으로 지정합니다. 이후 숫자 키를 누르면 같은 표시가 일괄 적용됩니다.</p></div></li>
          <li><b>5</b><div><strong>리뷰로 최종 확인하기</strong><p><kbd>⌘ / Ctrl + B</kbd>로 고객 셀렉만 모아 봅니다. 방향키로 이동하고, 아래 방향키로 제외하며 위 방향키로 직전 제외를 복원합니다. <kbd>Space</kbd>는 전체화면, <kbd>Esc</kbd>는 닫기입니다.</p></div></li>
          <li><b>6</b><div><strong>사진별 보정 메모 남기기</strong><p>오른쪽 미리보기에서 현재 사진에 필요한 보정 요청을 입력합니다. 메모는 해당 사진과 함께 저장됩니다.</p></div></li>
          <li><b>7</b><div><strong>저장 후 최종 제출하기</strong><p>별점·컬러·메모는 자동 저장됩니다. 검토가 끝나면 <em>제출하기</em>를 누르고 최종 확인까지 완료해 주세요.</p></div></li>
          <li><b>8</b><div><strong>대화·다운로드·모바일 사용</strong><p>프로젝트 대화에서 담당자와 의견을 주고받을 수 있습니다. 권한이 허용된 프로젝트는 원본을 내려받을 수 있으며, 모바일에서는 사진을 눌러 크게 본 뒤 별점 버튼으로 선택합니다.</p></div></li>
        </ol>
      </div>
      <footer className={styles.guideFooter}><button type="button" onClick={onClose}>가이드 닫기</button></footer>
    </div>
  </div>;
}
