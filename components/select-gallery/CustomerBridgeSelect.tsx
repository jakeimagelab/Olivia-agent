"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  customerBridgeRatingTargets,
  type CustomerBridgeColorLabel,
  type CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
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
import { useCustomerBridgeLocation } from "./useCustomerBridgeLocation";
import { useCustomerBridgeActiveSelection } from "./useCustomerBridgeActiveSelection";
import { useCustomerBridgeReviewController } from "./useCustomerBridgeReviewController";
import { useCustomerBridgeKeyboard } from "./useCustomerBridgeKeyboard";
import { useCustomerBridgeMediaRequests, useCustomerBridgeMediaStore } from "./useCustomerBridgeMedia";
import { useCustomerBridgeMessages } from "./useCustomerBridgeMessages";
import { useCustomerBridgeQuality } from "./useCustomerBridgeQuality";
import { useCustomerBridgeDownload } from "./useCustomerBridgeDownload";
import type { CustomerBridgeDownloadFormat } from "./useCustomerBridgeDownload";
import { useVirtualPhotoGrid } from "./useVirtualPhotoGrid";
import { buildCustomerBridgePhotoView } from "@/lib/select-gallery/customerBridgeView";
import { buildCustomerBridgePresentation } from "@/lib/select-gallery/customerBridgePresentation";
import { useCustomerBridgeImagePaging } from "./useCustomerBridgeImagePaging";
import { useCustomerBridgeSubmission } from "./useCustomerBridgeSubmission";
import {
  useCustomerBridgeMarksController,
  type CustomerBridgeInitialSelection,
} from "./useCustomerBridgeMarksController";
import { useCustomerBridgeWorkspaceLayout } from "./useCustomerBridgeWorkspaceLayout";
import { useCustomerBridgeResetController } from "./useCustomerBridgeResetController";
import { useCustomerBridgeFilters } from "./useCustomerBridgeFilters";
import { useCustomerBridgeDraftRefresh } from "./useCustomerBridgeDraftRefresh";
import { CustomerBridgeWorkspaceView } from "./CustomerBridgeWorkspaceView";

export type { CustomerBridgeDraft, CustomerBridgeGallery, CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";

const THUMB_MIN = 112;
const THUMB_MAX = 260;

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
  const openCompactFolders = useCallback(() => setCompactFoldersOpen(true), [setCompactFoldersOpen]);
  const openGuide = useCallback(() => setGuideOpen(true), []);

  const gridRef = useRef<HTMLDivElement>(null);
  const thumbnailGridRef = useRef<HTMLDivElement>(null);
  const guideButtonRef = useRef<HTMLButtonElement>(null);

  const { qualityResults, qualityJob, qualityState, startQuality, controlQuality, reviewQuality } = useCustomerBridgeQuality({
    qualityApi,
    canManageQuality,
  });

  const locationSelectionResetRef = useRef<(images: readonly CustomerBridgeImage[]) => void>(() => undefined);
  const fullscreenOpenRef = useRef<(imageId: string) => void>(() => undefined);
  const {
    location,
    folderTree,
    rootView,
    folderView,
    folderImages,
    childFolders,
    locationTotalCount,
    openLocation,
    goToParentFolder,
  } = useCustomerBridgeLocation({
    images,
    manifest: imageManifest,
    storageScope: localStorageScope,
    onLocationOpened: (nextImages) => locationSelectionResetRef.current(nextImages),
    onStorageError: reportOptionalStorageError,
  });
  const { downloadState, downloadBusy, downloadSelected } = useCustomerBridgeDownload({
    endpointBase,
    readOnly,
    pendingCount: selectionSync.pendingCount,
    selectedIds: serverSelectedIds,
  });
  const handleDownload = useCallback((format: CustomerBridgeDownloadFormat) => {
    void downloadSelected(format);
  }, [downloadSelected]);
  // 화면은 즉시 반응하되 미저장 사진에는 pending 표시를 남기고, 제출은 저장 완료 뒤에만 허용한다.
  const {
    error: submitError,
    setError: setSubmitError,
    submitting,
    reviewOpen: submitReviewOpen,
    openReview: openSubmitReview,
    closeReview: closeSubmitReview,
    submit,
    reviewItems: submitReviewItems,
    reviewSections: submitReviewSections,
  } = useCustomerBridgeSubmission({
    endpointBase,
    localStorageScope,
    readOnly,
    selectedIds: customerSelectedIds,
    ratings: customerRatings,
    colorLabels: customerColorLabels,
    notes,
    images,
    pendingCount: selectionSync.pendingCount,
    flushNow: flushSelectionSync,
    getRevision: getDraftRevision,
    onSubmitted,
    onStorageError: reportOptionalStorageError,
  });
  const openSubmitReviewAction = useCallback(() => {
    void openSubmitReview();
  }, [openSubmitReview]);
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
  const totalImageCount = imageManifest?.totalCount ?? gallery.total_jpg_count ?? images.length;
  const { state: imagePageState, requestNext: requestNextImagePage } = useCustomerBridgeImagePaging({
    location,
    filenameSearch,
    loadNextImagePage,
    ensureImagePage,
    getImagePageState,
  });
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
  const virtualGrid = useVirtualPhotoGrid({
    items: visibleImages,
    containerRef: gridRef,
    gridRef: thumbnailGridRef,
    thumbSize,
    mobile,
    resetKey: `${location.kind}:${location.kind === "folder" ? location.path : ""}:${filter}:${filenameSearch}:${labelFilters.rating ?? ""}:${labelFilters.color ?? ""}`,
    onNearEnd: loadNextImagePage ? requestNextImagePage : undefined,
  });
  const renderedImages = virtualGrid.renderedItems;
  const scrollToVirtualIndex = virtualGrid.scrollToIndex;
  useEffect(() => {
    if (!focusedImageId || location.kind === "root") return;
    if (gridRef.current?.querySelector(`[data-bridge-image-id="${CSS.escape(focusedImageId)}"]`)) return;
    scrollToVirtualIndex(orderedIds.indexOf(focusedImageId));
  }, [focusedImageId, location.kind, orderedIds, scrollToVirtualIndex]);
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
  useEffect(() => {
    fullscreenCloseRef.current = () => {
      if (fullscreenId) closeFullscreen();
    };
  }, [closeFullscreen, fullscreenId]);
  const openFocusedFullscreen = useCallback(() => {
    if (focusedImageId) openFullscreen(focusedImageId);
  }, [focusedImageId, openFullscreen]);

  const handleResetComplete = useCallback(() => {
    clearActiveSelection();
    resetReview();
    setFilter("all");
    setSubmitError("");
  }, [clearActiveSelection, resetReview, setFilter, setSubmitError]);
  const {
    resetButtonRef,
    resetConfirmOpen,
    resetting,
    openResetConfirm,
    closeResetConfirm,
    resetSelection,
  } = useCustomerBridgeResetController({
    readOnly,
    customerRatings,
    customerColorLabels,
    notes,
    serverRatings,
    serverColorLabels,
    serverNotes,
    enqueueSelectionSync,
    clearDisplayedSelection,
    flushSelectionSync,
    onResetComplete: handleResetComplete,
    onError: setSubmitError,
  });

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
  const openMessages = useCallback(() => {
    setSideTab("chat");
    setMobileSideOpen(true);
  }, [setMobileSideOpen, setSideTab]);
  const startQualityAnalysis = useCallback(() => {
    void startQuality();
  }, [startQuality]);

  const applyMainRating = useCallback((rating: 0 | CustomerBridgeRating) => {
    applyRatingTo(customerBridgeRatingTargets(activeImageIds, focusedImageId), rating);
  }, [activeImageIds, applyRatingTo, focusedImageId]);

  const applyMainColor = useCallback((colorLabel: CustomerBridgeColorLabel) => {
    toggleColorTo(customerBridgeRatingTargets(activeImageIds, focusedImageId), colorLabel);
  }, [activeImageIds, focusedImageId, toggleColorTo]);

  const closeMobileSide = useCallback(() => setMobileSideOpen(false), [setMobileSideOpen]);
  const handleQualityReview = useCallback((imageId: string, status: "confirmed_issue" | "confirmed_normal") => {
    void reviewQuality(imageId, status);
  }, [reviewQuality]);

  const handleSendMessage = useCallback(() => {
    void sendMessage();
  }, [sendMessage]);

  const updateFocusedNote = useCallback((value: string) => {
    if (!focusedImageId) return;
    updateNote(focusedImageId, value);
  }, [focusedImageId, updateNote]);

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

  const {
    locationLabel,
    rootPhotoCount,
    hasRootPhotos,
    unselectedInLocation,
    browserPhotoCount,
    locationCount,
    activeRatingFilterName,
    activeColorFilterName,
    saveStatusMessage,
  } = buildCustomerBridgePresentation({
    location,
    manifestRootPhotoCount: imageManifest?.rootPhotoCount,
    loadedRootPhotoCount: rootView.images.length,
    childFolderCount: childFolders.length,
    locationTotalCount,
    selectedInFolder,
    searchActive,
    filter,
    labelFilters,
    imagePageInitialized: Boolean(imagePageState?.initialized),
    imagePageTotalCount: imagePageState?.totalCount ?? 0,
    visibleImageCount: visibleImages.length,
    readOnly,
    saveStatus: selectionSync.status,
    lastSavedAt: selectionSync.lastSavedAt,
    pendingCount: selectionSync.pendingCount,
  });

  return <CustomerBridgeWorkspaceView
    embedded={embedded}
    readOnly={readOnly}
    hasAdminToolbarStatus={Boolean(adminToolbarStatus)}
    workspaceStyle={workspaceStyle}
    compactFoldersOpen={compactFoldersOpen}
    onCloseCompactFolders={closeCompactFolders}
    onBeginResize={beginResize}
    headerProps={{
      gallery,
      reviewer,
      totalImageCount,
      saveStatusMessage,
      selectionStatus: selectionSync.status,
      compactFoldersOpen,
      onOpenCompactFolders: openCompactFolders,
      location,
      onGoToParentFolder: goToParentFolder,
      onOpenLocation: openLocation,
      breadcrumbs: folderView?.breadcrumbs ?? [],
      filter,
      onFilterChange: setFilter,
      locationTotalCount,
      selectedInFolder,
      unselectedInLocation,
      guideButtonRef,
      guideOpen,
      onOpenGuide: openGuide,
      jpgDownloadEnabled: Boolean(gallery.download_jpg_enabled && !readOnly),
      rawDownloadEnabled: Boolean(gallery.download_raw_enabled && !readOnly),
      downloadDisabled: !serverSelectedIds.size || downloadBusy || selectionSync.pendingCount > 0,
      downloadBusy,
      downloadState,
      onDownload: handleDownload,
      messagesEnabled,
      unreadMessages,
      onOpenMessages: openMessages,
      qualityEnabled: Boolean(qualityApi),
      canManageQuality,
      qualityStatus: String(qualityJob?.status ?? ""),
      onStartQuality: startQualityAnalysis,
      adminToolbarAction,
      selectedImageCount: customerSelectedIds.size,
      onOpenReview: openReview,
      focusedImageId,
      onOpenFullscreen: openFocusedFullscreen,
      adminToolbarStatus,
    }}
    folderPanelProps={{
      compactOpen: compactFoldersOpen,
      location,
      folderTree,
      rootFolderCount: rootView.folders.length,
      totalImageCount,
      hasRootPhotos,
      rootPhotoCount,
      filter,
      locationTotalCount,
      selectedInFolder,
      unselectedInLocation,
      qualityEnabled: Boolean(qualityApi),
      qualityCounts,
      qualityState,
      qualityJob,
      canManageQuality,
      activeImageCount: activeImageIds.size,
      selectedImageCount: customerSelectedIds.size,
      onCloseCompact: closeCompactFolders,
      onOpenLocation: openLocation,
      onFilterChange: setFilter,
      onControlQuality: controlQuality,
    }}
    browserPanelProps={{
      location,
      locationLabel,
      locationCount,
      browserPhotoCount,
      searchActive,
      filenameSearch,
      searchInputRef,
      activeRatingFilterName,
      activeColorFilterName,
      labelFilters,
      thumbSize,
      thumbMin: THUMB_MIN,
      thumbMax: THUMB_MAX,
      gridRef,
      thumbnailGridRef,
      childFolders,
      hasRootPhotos,
      rootPhotoCount,
      virtualTotalHeight: virtualGrid.totalHeight,
      virtualTopPadding: virtualGrid.topPadding,
      virtualBottomPadding: virtualGrid.bottomPadding,
      renderedImages,
      visibleImageCount: visibleImages.length,
      activeImageIds,
      focusedImageId,
      customerRatings,
      customerColorLabels,
      pendingImageIds: selectionSync.pendingImageIds,
      qualityResults,
      mobile,
      marquee,
      onApplyLabelFilterCommand: applyLabelFilterCommand,
      onFilenameSearchChange: setFilenameSearch,
      onClearFilenameSearch: clearFilenameSearch,
      onThumbSizeChange: setThumbSize,
      onOpenLocation: openLocation,
      onPhotoClick: handlePhotoClick,
      onImageError: handleImageError,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    }}
    sidePanelProps={{
      sideTab,
      onSideTabChange: setSideTab,
      mobileSideOpen,
      onCloseMobile: closeMobileSide,
      messagesEnabled,
      unreadMessages,
      activeCount: activeImageIds.size,
      focusedImage,
      orderedIds,
      onFocusImage: setFocusedImageId,
      onOpenFullscreen: openFullscreen,
      onImageError: handleImageError,
      quality: focusedImage ? qualityResults[focusedImage.id] : undefined,
      canManageQuality,
      onReviewQuality: handleQualityReview,
      readOnly,
      rating: focusedImage ? customerRatings[focusedImage.id] ?? 0 : 0,
      colorLabel: focusedImage ? customerColorLabels[focusedImage.id] ?? null : null,
      note: focusedImage ? notes[focusedImage.id] ?? "" : "",
      onRate: applyMainRating,
      onColor: applyMainColor,
      onNote: updateFocusedNote,
      messages,
      messageText,
      setMessageText,
      messageState,
      messageImageScoped,
      setMessageImageScoped,
      sendingMessage,
      messagesEndRef,
      onSendMessage: handleSendMessage,
    }}
    footerProps={{
      readOnly,
      totalPhotoCount: images.length,
      selectedPhotoCount: customerSelectedIds.size,
      saveStatus: selectionSync.status,
      saveStatusMessage,
      onRetrySave: selectionSync.retry,
      downloadState,
      submitError,
      canFinalize: reviewer?.can_finalize !== false,
      resetButtonRef,
      resetting,
      hasNotes: Boolean(Object.keys(notes).length),
      onReset: openResetConfirm,
      onReview: openReview,
      submitting,
      pendingCount: selectionSync.pendingCount,
      onSubmit: openSubmitReviewAction,
    }}
    overlayProps={{
      fullscreenImage,
      fullscreenIndex,
      fullscreenTotal: visibleImages.length,
      zoomed,
      reviewOpen: Boolean(reviewIds),
      reviewImages,
      reviewActiveId,
      reviewRemoved,
      ratings: customerRatings,
      colorLabels: customerColorLabels,
      notes,
      guideOpen,
      resetConfirmOpen,
      resetting,
      submitReviewOpen,
      submitReviewSections,
      submitReviewItems,
      selectedCount: customerSelectedIds.size,
      submitting,
      submitError,
      readOnly,
      onToggleFullscreenZoom: toggleFullscreenZoom,
      onCloseFullscreen: closeFullscreen,
      onMoveFullscreen: moveFullscreen,
      onApplyRating: applyRatingTo,
      onToggleColor: toggleColorTo,
      onUpdateNote: updateNote,
      onImageError: handleImageError,
      onSetReviewActive: setReviewActiveId,
      onCloseReview: closeReview,
      onRemoveFromReview: removeFromReview,
      onRestoreReview: restoreReview,
      onOpenFullscreen: openFullscreen,
      onCloseGuide: closeGuide,
      onCloseReset: closeResetConfirm,
      onReset: resetSelection,
      onCloseSubmitReview: closeSubmitReview,
      onSubmit: submit,
    }}
  />;
}
