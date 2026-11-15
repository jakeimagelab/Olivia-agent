"use client";

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type SelectionMediaUrls, type SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";
import type {
  PersonSelectClientImagePageState,
  PersonSelectClientImageQuery,
} from "@/lib/person-select/imagePageClient";
import type {
  CustomerBridgeDraft,
  CustomerBridgeFolderManifest,
  CustomerBridgeGallery,
  CustomerBridgeImage,
} from "@/lib/select-gallery/customerBridgeTypes";
import { useCustomerBridgeKeyboard } from "./useCustomerBridgeKeyboard";
import { useCustomerBridgeMediaStore } from "./useCustomerBridgeMedia";
import { useCustomerBridgeQuality } from "./useCustomerBridgeQuality";
import { useCustomerBridgeDownload } from "./useCustomerBridgeDownload";
import type { CustomerBridgeDownloadFormat } from "./useCustomerBridgeDownload";
import {
  useCustomerBridgeMarksController,
  type CustomerBridgeInitialSelection,
} from "./useCustomerBridgeMarksController";
import { useCustomerBridgeWorkspaceLayout } from "./useCustomerBridgeWorkspaceLayout";
import { useCustomerBridgeFilters } from "./useCustomerBridgeFilters";
import { useCustomerBridgeDraftRefresh } from "./useCustomerBridgeDraftRefresh";
import { useCustomerBridgeBrowserController } from "./useCustomerBridgeBrowserController";
import { useCustomerBridgeSideController } from "./useCustomerBridgeSideController";
import { useCustomerBridgeFinalizeController } from "./useCustomerBridgeFinalizeController";
import { useCustomerBridgeViewerController } from "./useCustomerBridgeViewerController";
import { CustomerBridgeWorkspaceComposer } from "./CustomerBridgeWorkspaceComposer";

export type { CustomerBridgeDraft, CustomerBridgeGallery, CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";

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
  imageManifest,
  loadNextImagePage,
  ensureImagePage,
  getImagePageState,
}: {
  shareToken: string;
  gallery: CustomerBridgeGallery;
  images: CustomerBridgeImage[];
  initialDraft?: CustomerBridgeDraft | null;
  initialSelection?: CustomerBridgeInitialSelection;
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
  imageManifest?: CustomerBridgeFolderManifest | null;
  loadNextImagePage?: (query: PersonSelectClientImageQuery) => Promise<boolean>;
  ensureImagePage?: (query: PersonSelectClientImageQuery) => Promise<boolean>;
  getImagePageState?: (query: PersonSelectClientImageQuery) => PersonSelectClientImagePageState;
}) {
  const endpointBase = apiBase ?? `/api/select/${shareToken}`;
  const localStorageScope = storageScope ?? shareToken;
  const { images, imageById, handleImageError, requestMedia } = useCustomerBridgeMediaStore({
    initialImages,
    refreshImageUrl,
    loadImageUrls,
  });
  const {
    serverRatings,
    serverColorLabels,
    serverNotes,
    customerRatings,
    customerColorLabels,
    notes,
    serverSelectedIds,
    customerSelectedIds,
    selectionSync,
    enqueueSelectionSync,
    flushSelectionSync,
    getPendingSelectionDiffs,
    installServerSnapshot,
    getDraftRevision,
    applyRatingTo,
    applyColorTo,
    toggleColorTo,
    updateNote,
    clearDisplayedSelection,
  } = useCustomerBridgeMarksController({
    endpointBase,
    localStorageScope,
    initialDraft,
    initialSelection,
    readOnly,
  });
  useCustomerBridgeDraftRefresh({
    enabled: !readOnly,
    endpointBase,
    installServerSnapshot,
    getPendingSelectionDiffs,
  });
  const fullscreenCloseRef = useRef<() => void>(() => undefined);
  const closeFullscreenBeforeFilterChange = useCallback(() => fullscreenCloseRef.current(), []);
  const {
    filter,
    setFilter,
    labelFilters,
    filenameSearch,
    setFilenameSearch,
    searchInputRef,
    clearFilenameSearch,
    applyLabelFilterCommand,
    handleSearchFilterShortcut,
  } = useCustomerBridgeFilters({ onBeforeFilterChange: closeFullscreenBeforeFilterChange });
  const [thumbSize, setThumbSize] = useState(156);
  const {
    compactFoldersOpen,
    setCompactFoldersOpen,
    mobile,
    closeCompactFolders,
    beginResize,
    workspaceStyle,
  } = useCustomerBridgeWorkspaceLayout();
  const [guideOpen, setGuideOpen] = useState(false);
  const openGuide = useCallback(() => setGuideOpen(true), []);

  const gridRef = useRef<HTMLDivElement>(null);
  const thumbnailGridRef = useRef<HTMLDivElement>(null);
  const guideButtonRef = useRef<HTMLButtonElement>(null);

  const { qualityResults, qualityJob, qualityState, startQuality, controlQuality, reviewQuality } = useCustomerBridgeQuality({
    qualityApi,
    canManageQuality,
  });

  const browserController = useCustomerBridgeBrowserController({
    images,
    manifest: imageManifest,
    storageScope: localStorageScope,
    filter,
    filenameSearch,
    labelFilters,
    selectedIds: customerSelectedIds,
    ratings: customerRatings,
    colorLabels: customerColorLabels,
    qualityResults,
    mobile,
    readOnly,
    thumbSize,
    gridRef,
    thumbnailGridRef,
    onCloseCompactFolders: closeCompactFolders,
    onStorageError: reportOptionalStorageError,
    loadNextImagePage,
    ensureImagePage,
    getImagePageState,
  });
  const {
    visibleImages,
    orderedIds,
    focusedImageId,
    setFocusedImageId,
    activeImageIds,
    setActiveImageIds,
    anchorId,
    setAnchorId,
    clearActiveSelection,
    renderedImages,
    setMobileImageOpener,
  } = browserController;
  const { downloadState, downloadBusy, downloadSelected } = useCustomerBridgeDownload({
    endpointBase,
    readOnly,
    pendingCount: selectionSync.pendingCount,
    selectedIds: serverSelectedIds,
  });
  const handleDownload = useCallback((format: CustomerBridgeDownloadFormat) => {
    void downloadSelected(format);
  }, [downloadSelected]);
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
    openFocusedFullscreen,
  } = useCustomerBridgeViewerController({
    images,
    visibleImages,
    renderedImages,
    imageById,
    selectedIds: customerSelectedIds,
    focusedImageId,
    ratings: customerRatings,
    colorLabels: customerColorLabels,
    setFocusedImageId,
    applyRatingTo,
    applyColorTo,
    requestMedia,
    setMobileImageOpener,
    fullscreenCloseRef,
  });

  const {
    submitError,
    submitting,
    submitReviewOpen,
    openSubmitReview: openSubmitReviewAction,
    closeSubmitReview,
    submit,
    submitReviewItems,
    submitReviewSections,
    resetButtonRef,
    resetConfirmOpen,
    resetting,
    openResetConfirm,
    closeResetConfirm,
    resetSelection,
  } = useCustomerBridgeFinalizeController({
    endpointBase,
    localStorageScope,
    readOnly,
    selectedIds: customerSelectedIds,
    ratings: customerRatings,
    colorLabels: customerColorLabels,
    notes,
    images,
    pendingCount: selectionSync.pendingCount,
    flushSelectionSync,
    getDraftRevision,
    onSubmitted,
    onStorageError: reportOptionalStorageError,
    serverRatings,
    serverColorLabels,
    serverNotes,
    enqueueSelectionSync,
    clearDisplayedSelection,
    clearActiveSelection,
    resetReview,
    setFilter,
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
    openMessages,
    closeMobileSide,
    applyMainRating,
    applyMainColor,
    handleQualityReview,
    handleSendMessage,
    updateFocusedNote,
  } = useCustomerBridgeSideController({
    endpointBase,
    messagesEnabled,
    mobile,
    focusedImageId,
    activeImageIds,
    applyRatingTo,
    toggleColorTo,
    updateNote,
    reviewQuality,
  });
  const startQualityAnalysis = useCallback(() => {
    void startQuality();
  }, [startQuality]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    requestAnimationFrame(() => guideButtonRef.current?.focus());
  }, []);

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

  return <CustomerBridgeWorkspaceComposer
    embedded={embedded}
    readOnly={readOnly}
    gallery={gallery}
    reviewer={reviewer}
    messagesEnabled={messagesEnabled}
    qualityApi={qualityApi}
    canManageQuality={canManageQuality}
    adminToolbarAction={adminToolbarAction}
    adminToolbarStatus={adminToolbarStatus}
    imageManifest={imageManifest}
    images={images}
    focusedImage={focusedImage}
    thumbSize={thumbSize}
    setThumbSize={setThumbSize}
    guideOpen={guideOpen}
    guideButtonRef={guideButtonRef}
    gridRef={gridRef}
    thumbnailGridRef={thumbnailGridRef}
    layout={{ compactFoldersOpen, setCompactFoldersOpen, mobile, closeCompactFolders, beginResize, workspaceStyle }}
    filters={{ filter, setFilter, labelFilters, filenameSearch, setFilenameSearch, searchInputRef, clearFilenameSearch, applyLabelFilterCommand, handleSearchFilterShortcut }}
    marks={{ serverRatings, serverColorLabels, serverNotes, customerRatings, customerColorLabels, notes, serverSelectedIds, customerSelectedIds, selectionSync, enqueueSelectionSync, flushSelectionSync, getPendingSelectionDiffs, installServerSnapshot, getDraftRevision, applyRatingTo, applyColorTo, toggleColorTo, updateNote, clearDisplayedSelection }}
    browser={{ ...browserController, handleImageError }}
    download={{ downloadState, downloadBusy, downloadSelected }}
    viewer={{ fullscreenId, fullscreenImage, fullscreenIndex, zoomed, openFullscreen, closeFullscreen, toggleFullscreenZoom, moveFullscreen, reviewIds, reviewActiveId, reviewRemoved, reviewImages, setReviewActiveId, openReview, closeReview, resetReview, moveReview, removeFromReview, restoreReview, openFocusedFullscreen }}
    finalize={{ submitError, submitting, submitReviewOpen, openSubmitReview: openSubmitReviewAction, closeSubmitReview, submit, submitReviewItems, submitReviewSections, resetButtonRef, resetConfirmOpen, resetting, openResetConfirm, closeResetConfirm, resetSelection }}
    side={{ sideTab, setSideTab, mobileSideOpen, setMobileSideOpen, messages, messageText, setMessageText, messageState, messageImageScoped, setMessageImageScoped, unreadMessages, sendingMessage, messagesEndRef, openMessages, closeMobileSide, applyMainRating, applyMainColor, handleQualityReview, handleSendMessage, updateFocusedNote }}
    quality={{ qualityResults, qualityJob, qualityState, startQuality, controlQuality, reviewQuality }}
    onOpenGuide={openGuide}
    onCloseGuide={closeGuide}
    onDownload={handleDownload}
    onStartQuality={startQualityAnalysis}
  />;
}
