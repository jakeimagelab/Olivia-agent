"use client";

import { RotateCcw } from "lucide-react";
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
import {
  EMPTY_BRIDGE_LABEL_FILTERS,
  bridgeLabelFilterName,
  updateBridgeLabelFilters,
  type BridgeLabelFilterCommand,
  type BridgeLabelFilters,
} from "@/lib/photo-bridge/labels";
import { useBridgeSearchFilterShortcuts } from "@/lib/photo-bridge/useBridgeSearchFilterShortcuts";
import { useVisibleSelectionRefresh } from "@/components/person-select/useVisibleSelectionRefresh";
import { FinalSelectionSubmitDialog } from "@/components/person-select/FinalSelectionSubmitDialog";
import { type SelectionMediaUrls, type SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";
import { type SharedSelectionSyncSnapshot } from "@/lib/person-select/selectionSync";
import type {
  PersonSelectClientImagePageState,
  PersonSelectClientImageQuery,
} from "@/lib/person-select/imagePageClient";
import styles from "./CustomerBridgeSelect.module.css";
import type {
  CustomerBridgeDraft,
  CustomerBridgeFolderManifest,
  CustomerBridgeGallery,
  CustomerBridgeImage,
} from "@/lib/select-gallery/customerBridgeTypes";
import { PhotoOverlay, ReviewOverlay } from "./CustomerBridgeOverlays";
import { useCustomerBridgeLocation } from "./useCustomerBridgeLocation";
import { useCustomerBridgeActiveSelection } from "./useCustomerBridgeActiveSelection";
import { useCustomerBridgeReviewController } from "./useCustomerBridgeReviewController";
import { useCustomerBridgeKeyboard } from "./useCustomerBridgeKeyboard";
import { useCustomerBridgeMediaRequests, useCustomerBridgeMediaStore } from "./useCustomerBridgeMedia";
import { useCustomerBridgeMessages } from "./useCustomerBridgeMessages";
import { useCustomerBridgeQuality } from "./useCustomerBridgeQuality";
import { useCustomerBridgeDownload } from "./useCustomerBridgeDownload";
import { useVirtualPhotoGrid } from "./useVirtualPhotoGrid";
import { buildCustomerBridgePhotoView, type CustomerBridgePhotoFilter as PhotoFilter } from "@/lib/select-gallery/customerBridgeView";
import { CustomerBridgeGuideDialog, CustomerBridgeResetDialog } from "./CustomerBridgeDialogs";
import { useCustomerBridgeImagePaging } from "./useCustomerBridgeImagePaging";
import { useCustomerBridgeSubmission } from "./useCustomerBridgeSubmission";
import { CustomerBridgeSidePanel } from "./CustomerBridgeSidePanel";
import { CustomerBridgeBrowserPanel } from "./CustomerBridgeBrowserPanel";
import { CustomerBridgeFolderPanel } from "./CustomerBridgeFolderPanel";
import {
  useCustomerBridgeMarksController,
  type CustomerBridgeInitialSelection,
} from "./useCustomerBridgeMarksController";
import { useCustomerBridgeWorkspaceLayout } from "./useCustomerBridgeWorkspaceLayout";
import { useCustomerBridgeResetController } from "./useCustomerBridgeResetController";
import { CustomerBridgeHeader } from "./CustomerBridgeHeader";

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
  const [filter, setFilter] = useState<PhotoFilter>("all");
  const [labelFilters, setLabelFilters] = useState<BridgeLabelFilters>(() => ({ ...EMPTY_BRIDGE_LABEL_FILTERS }));
  const [filenameSearch, setFilenameSearch] = useState("");
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

  const gridRef = useRef<HTMLDivElement>(null);
  const thumbnailGridRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  const handleResetComplete = useCallback(() => {
    clearActiveSelection();
    resetReview();
    setFilter("all");
    setSubmitError("");
  }, [clearActiveSelection, resetReview, setSubmitError]);
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

  const clearFilenameSearch = useCallback(() => {
    setFilenameSearch("");
    searchInputRef.current?.focus();
  }, []);

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

  const locationLabel = location.kind === "root" ? "프로젝트" : location.kind === "all" ? "전체 사진" : location.path || "루트 사진";
  const rootPhotoCount = imageManifest?.rootPhotoCount ?? rootView.images.length;
  const hasRootPhotos = rootPhotoCount > 0;
  const unselectedInLocation = Math.max(0, locationTotalCount - selectedInFolder);
  const hasLabelFilter = labelFilters.rating !== null || labelFilters.color !== null;
  const browserPhotoCount = searchActive && filter === "all" && !hasLabelFilter && imagePageState?.initialized
    ? imagePageState.totalCount
    : !searchActive && !hasLabelFilter && filter === "all"
      ? locationTotalCount
      : !searchActive && !hasLabelFilter && filter === "selected"
        ? selectedInFolder
        : !searchActive && !hasLabelFilter && filter === "unselected"
          ? unselectedInLocation
          : visibleImages.length;
  const locationCount = location.kind === "root" ? childFolders.length + (hasRootPhotos ? 1 : 0) : browserPhotoCount;
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
    <CustomerBridgeHeader
      gallery={gallery}
      reviewer={reviewer}
      totalImageCount={totalImageCount}
      saveStatusMessage={saveStatusMessage}
      selectionStatus={selectionSync.status}
      compactFoldersOpen={compactFoldersOpen}
      onOpenCompactFolders={() => setCompactFoldersOpen(true)}
      location={location}
      onGoToParentFolder={goToParentFolder}
      onOpenLocation={openLocation}
      breadcrumbs={folderView?.breadcrumbs ?? []}
      filter={filter}
      onFilterChange={setFilter}
      locationTotalCount={locationTotalCount}
      selectedInFolder={selectedInFolder}
      unselectedInLocation={unselectedInLocation}
      guideButtonRef={guideButtonRef}
      guideOpen={guideOpen}
      onOpenGuide={() => setGuideOpen(true)}
      jpgDownloadEnabled={Boolean(gallery.download_jpg_enabled && !readOnly)}
      rawDownloadEnabled={Boolean(gallery.download_raw_enabled && !readOnly)}
      downloadDisabled={!serverSelectedIds.size || downloadBusy || selectionSync.pendingCount > 0}
      downloadBusy={downloadBusy}
      downloadState={downloadState}
      onDownload={(kind) => void downloadSelected(kind)}
      messagesEnabled={messagesEnabled}
      unreadMessages={unreadMessages}
      onOpenMessages={() => { setSideTab("chat"); setMobileSideOpen(true); }}
      qualityEnabled={Boolean(qualityApi)}
      canManageQuality={canManageQuality}
      qualityStatus={String(qualityJob?.status ?? "")}
      onStartQuality={() => void startQuality()}
      adminToolbarAction={adminToolbarAction}
      selectedImageCount={customerSelectedIds.size}
      onOpenReview={openReview}
      focusedImageId={focusedImageId}
      onOpenFullscreen={() => { if (focusedImageId) openFullscreen(focusedImageId); }}
      adminToolbarStatus={adminToolbarStatus}
    />

    <section className={styles.workspace} style={workspaceStyle}>
      {compactFoldersOpen ? <button type="button" className={styles.folderBackdrop} aria-label="폴더 닫기" onClick={() => setCompactFoldersOpen(false)} /> : null}
      <CustomerBridgeFolderPanel
        compactOpen={compactFoldersOpen}
        location={location}
        folderTree={folderTree}
        rootFolderCount={rootView.folders.length}
        totalImageCount={totalImageCount}
        hasRootPhotos={hasRootPhotos}
        rootPhotoCount={rootPhotoCount}
        filter={filter}
        locationTotalCount={locationTotalCount}
        selectedInFolder={selectedInFolder}
        unselectedInLocation={unselectedInLocation}
        qualityEnabled={Boolean(qualityApi)}
        qualityCounts={qualityCounts}
        qualityState={qualityState}
        qualityJob={qualityJob}
        canManageQuality={canManageQuality}
        activeImageCount={activeImageIds.size}
        selectedImageCount={customerSelectedIds.size}
        onCloseCompact={closeCompactFolders}
        onOpenLocation={openLocation}
        onFilterChange={setFilter}
        onControlQuality={controlQuality}
      />

      <button type="button" className={styles.paneDivider} aria-label="폴더 패널 너비 조절" onPointerDown={(event) => beginResize("folder", event)} />

      <CustomerBridgeBrowserPanel
        location={location}
        locationLabel={locationLabel}
        locationCount={locationCount}
        browserPhotoCount={browserPhotoCount}
        searchActive={searchActive}
        filenameSearch={filenameSearch}
        searchInputRef={searchInputRef}
        activeRatingFilterName={activeRatingFilterName}
        activeColorFilterName={activeColorFilterName}
        labelFilters={labelFilters}
        thumbSize={thumbSize}
        thumbMin={THUMB_MIN}
        thumbMax={THUMB_MAX}
        gridRef={gridRef}
        thumbnailGridRef={thumbnailGridRef}
        childFolders={childFolders}
        hasRootPhotos={hasRootPhotos}
        rootPhotoCount={rootPhotoCount}
        virtualTotalHeight={virtualGrid.totalHeight}
        virtualTopPadding={virtualGrid.topPadding}
        virtualBottomPadding={virtualGrid.bottomPadding}
        renderedImages={renderedImages}
        visibleImageCount={visibleImages.length}
        activeImageIds={activeImageIds}
        focusedImageId={focusedImageId}
        customerRatings={customerRatings}
        customerColorLabels={customerColorLabels}
        pendingImageIds={selectionSync.pendingImageIds}
        qualityResults={qualityResults}
        mobile={mobile}
        marquee={marquee}
        onApplyLabelFilterCommand={applyLabelFilterCommand}
        onFilenameSearchChange={setFilenameSearch}
        onClearFilenameSearch={clearFilenameSearch}
        onThumbSizeChange={setThumbSize}
        onOpenLocation={openLocation}
        onPhotoClick={handlePhotoClick}
        onImageError={handleImageError}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      <button type="button" className={styles.paneDivider} aria-label="미리보기 패널 너비 조절" onPointerDown={(event) => beginResize("preview", event)} />

      <CustomerBridgeSidePanel
        sideTab={sideTab}
        onSideTabChange={setSideTab}
        mobileSideOpen={mobileSideOpen}
        onCloseMobile={closeMobileSide}
        messagesEnabled={messagesEnabled}
        unreadMessages={unreadMessages}
        activeCount={activeImageIds.size}
        focusedImage={focusedImage}
        orderedIds={orderedIds}
        onFocusImage={setFocusedImageId}
        onOpenFullscreen={openFullscreen}
        onImageError={handleImageError}
        quality={focusedImage ? qualityResults[focusedImage.id] : undefined}
        canManageQuality={canManageQuality}
        onReviewQuality={handleQualityReview}
        readOnly={readOnly}
        rating={focusedImage ? customerRatings[focusedImage.id] ?? 0 : 0}
        colorLabel={focusedImage ? customerColorLabels[focusedImage.id] ?? null : null}
        note={focusedImage ? notes[focusedImage.id] ?? "" : ""}
        onRate={applyMainRating}
        onColor={applyMainColor}
        onNote={updateFocusedNote}
        messages={messages}
        messageText={messageText}
        setMessageText={setMessageText}
        messageState={messageState}
        messageImageScoped={messageImageScoped}
        setMessageImageScoped={setMessageImageScoped}
        sendingMessage={sendingMessage}
        messagesEndRef={messagesEndRef}
        onSendMessage={handleSendMessage}
      />
    </section>

    {!readOnly ? <footer className={styles.footer}><div className={styles.footerSummary}><strong>전체 {images.length.toLocaleString("ko-KR")}장 · 고객 셀렉 {customerSelectedIds.size.toLocaleString("ko-KR")}장</strong>{selectionSync.status === "error" ? <button type="button" className={styles.saveRetry} onClick={selectionSync.retry}>{saveStatusMessage}</button> : <span>{downloadState || submitError || (reviewer?.can_finalize === false ? `${saveStatusMessage} · 최종 확정 권한 없음` : saveStatusMessage)}</span>}</div><button ref={resetButtonRef} className={styles.resetButton} type="button" disabled={resetting || (!customerSelectedIds.size && !Object.keys(notes).length)} onClick={openResetConfirm}><RotateCcw size={14} /> 셀렉 초기화</button><button className={styles.reviewButton} type="button" disabled={!customerSelectedIds.size} onClick={openReview}>리뷰</button><button className={styles.submitButton} type="button" disabled={!customerSelectedIds.size || submitting || selectionSync.pendingCount > 0 || selectionSync.status !== "saved" || reviewer?.can_finalize === false} onClick={() => void openSubmitReview()}>{reviewer?.can_finalize === false ? "확정 권한 없음" : submitting ? "제출 중" : "제출하기"}</button></footer> : null}

    {fullscreenImage ? <PhotoOverlay image={fullscreenImage} index={fullscreenIndex} total={visibleImages.length} rating={customerRatings[fullscreenImage.id] ?? 0} colorLabel={customerColorLabels[fullscreenImage.id] ?? null} note={notes[fullscreenImage.id] ?? ""} zoomed={zoomed} onZoom={toggleFullscreenZoom} onClose={closeFullscreen} onPrev={() => moveFullscreen(-1)} onNext={() => moveFullscreen(1)} onRate={(rating) => applyRatingTo(new Set([fullscreenImage.id]), rating)} onColor={(colorLabel) => toggleColorTo(new Set([fullscreenImage.id]), colorLabel)} onNote={(value) => updateNote(fullscreenImage.id, value)} onImageError={handleImageError} readOnly={readOnly} /> : null}
    {reviewIds ? <ReviewOverlay images={reviewImages} activeId={reviewActiveId} removed={reviewRemoved} ratings={customerRatings} colorLabels={customerColorLabels} onActive={setReviewActiveId} onClose={closeReview} onRemove={removeFromReview} onRestore={restoreReview} onRate={(id, rating) => rating === 0 ? removeFromReview(id) : applyRatingTo(new Set([id]), rating)} onColor={(id, colorLabel) => customerColorLabels[id] === colorLabel && !customerRatings[id] ? removeFromReview(id) : toggleColorTo(new Set([id]), colorLabel)} onFullscreen={openFullscreen} onImageError={handleImageError} /> : null}
    {guideOpen ? <CustomerBridgeGuideDialog onClose={closeGuide} /> : null}
    {resetConfirmOpen ? <CustomerBridgeResetDialog selectedCount={customerSelectedIds.size} resetting={resetting} onCancel={closeResetConfirm} onConfirm={() => void resetSelection()} /> : null}
    {submitReviewOpen ? <FinalSelectionSubmitDialog selectedCount={customerSelectedIds.size} sections={submitReviewSections} items={submitReviewItems} busy={submitting} error={submitError} onCancel={closeSubmitReview} onConfirm={() => void submit()} /> : null}
  </main>;
}
