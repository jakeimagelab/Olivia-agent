"use client";

import { useCallback, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";

import { buildCustomerBridgePresentation } from "@/lib/select-gallery/customerBridgePresentation";
import type {
  CustomerBridgeFolderManifest,
  CustomerBridgeGallery,
  CustomerBridgeImage,
} from "@/lib/select-gallery/customerBridgeTypes";
import type { CustomerBridgeDownloadFormat } from "./useCustomerBridgeDownload";
import type { useCustomerBridgeBrowserController } from "./useCustomerBridgeBrowserController";
import type { useCustomerBridgeDownload } from "./useCustomerBridgeDownload";
import type { useCustomerBridgeFilters } from "./useCustomerBridgeFilters";
import type { useCustomerBridgeFinalizeController } from "./useCustomerBridgeFinalizeController";
import type { useCustomerBridgeMarksController } from "./useCustomerBridgeMarksController";
import type { useCustomerBridgeQuality } from "./useCustomerBridgeQuality";
import type { useCustomerBridgeSideController } from "./useCustomerBridgeSideController";
import type { useCustomerBridgeViewerController } from "./useCustomerBridgeViewerController";
import type { useCustomerBridgeWorkspaceLayout } from "./useCustomerBridgeWorkspaceLayout";
import {
  CustomerBridgeWorkspaceView,
  type CustomerBridgeWorkspaceViewProps,
} from "./CustomerBridgeWorkspaceView";

const THUMB_MIN = 112;
const THUMB_MAX = 260;

type CustomerBridgeReviewer = {
  display_name: string;
  role_label?: string | null;
  can_finalize?: boolean;
  can_download_jpg?: boolean;
  can_download_raw?: boolean;
} | null;

type CustomerBridgeWorkspaceComposerProps = {
  embedded: boolean;
  readOnly: boolean;
  gallery: CustomerBridgeGallery;
  reviewer?: CustomerBridgeReviewer;
  messagesEnabled: boolean;
  qualityApi?: string;
  canManageQuality: boolean;
  adminToolbarAction?: ReactNode;
  adminToolbarStatus?: ReactNode;
  topContent?: ReactNode;
  imageManifest?: CustomerBridgeFolderManifest | null;
  images: readonly CustomerBridgeImage[];
  focusedImage: CustomerBridgeImage | null;
  thumbSize: number;
  setThumbSize: Dispatch<SetStateAction<number>>;
  guideOpen: boolean;
  guideButtonRef: RefObject<HTMLButtonElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  thumbnailGridRef: RefObject<HTMLDivElement | null>;
  layout: ReturnType<typeof useCustomerBridgeWorkspaceLayout>;
  filters: ReturnType<typeof useCustomerBridgeFilters>;
  marks: ReturnType<typeof useCustomerBridgeMarksController>;
  browser: ReturnType<typeof useCustomerBridgeBrowserController> & {
    handleImageError: (imageId: string) => void;
  };
  download: ReturnType<typeof useCustomerBridgeDownload>;
  viewer: ReturnType<typeof useCustomerBridgeViewerController>;
  finalize: ReturnType<typeof useCustomerBridgeFinalizeController>;
  side: Omit<ReturnType<typeof useCustomerBridgeSideController>, "sendMessage">;
  quality: ReturnType<typeof useCustomerBridgeQuality>;
  onOpenGuide: () => void;
  onCloseGuide: () => void;
  onDownload: (format: CustomerBridgeDownloadFormat) => void;
  onStartQuality: () => void;
};

export function CustomerBridgeWorkspaceComposer({
  embedded,
  readOnly,
  gallery,
  reviewer,
  messagesEnabled,
  qualityApi,
  canManageQuality,
  adminToolbarAction,
  adminToolbarStatus,
  topContent,
  imageManifest,
  images,
  focusedImage,
  thumbSize,
  setThumbSize,
  guideOpen,
  guideButtonRef,
  gridRef,
  thumbnailGridRef,
  layout,
  filters,
  marks,
  browser,
  download,
  viewer,
  finalize,
  side,
  quality,
  onOpenGuide,
  onCloseGuide,
  onDownload,
  onStartQuality,
}: CustomerBridgeWorkspaceComposerProps) {
  const setCompactFoldersOpen = layout.setCompactFoldersOpen;
  const openCompactFolders = useCallback(
    () => setCompactFoldersOpen(true),
    [setCompactFoldersOpen],
  );
  const totalImageCount = imageManifest?.totalCount ?? gallery.total_jpg_count ?? images.length;
  const presentation = buildCustomerBridgePresentation({
    location: browser.location,
    manifestRootPhotoCount: imageManifest?.rootPhotoCount,
    loadedRootPhotoCount: browser.rootView.images.length,
    childFolderCount: browser.childFolders.length,
    locationTotalCount: browser.locationTotalCount,
    selectedInFolder: browser.selectedInFolder,
    searchActive: browser.searchActive,
    filter: filters.filter,
    labelFilters: filters.labelFilters,
    imagePageInitialized: Boolean(browser.imagePageState?.initialized),
    imagePageTotalCount: browser.imagePageState?.totalCount ?? 0,
    visibleImageCount: browser.visibleImages.length,
    readOnly,
    saveStatus: marks.selectionSync.status,
    lastSavedAt: marks.selectionSync.lastSavedAt,
    pendingCount: marks.selectionSync.pendingCount,
  });

  const workspaceProps: CustomerBridgeWorkspaceViewProps = {
    embedded,
    readOnly,
    topContent,
    hasAdminToolbarStatus: Boolean(adminToolbarStatus),
    workspaceStyle: layout.workspaceStyle,
    compactFoldersOpen: layout.compactFoldersOpen,
    onCloseCompactFolders: layout.closeCompactFolders,
    onBeginResize: layout.beginResize,
    headerProps: {
      gallery,
      reviewer,
      totalImageCount,
      saveStatusMessage: presentation.saveStatusMessage,
      selectionStatus: marks.selectionSync.status,
      compactFoldersOpen: layout.compactFoldersOpen,
      onOpenCompactFolders: openCompactFolders,
      location: browser.location,
      onGoToParentFolder: browser.goToParentFolder,
      onOpenLocation: browser.openLocation,
      breadcrumbs: browser.folderView?.breadcrumbs ?? [],
      filter: filters.filter,
      onFilterChange: filters.setFilter,
      locationTotalCount: browser.locationTotalCount,
      selectedInFolder: browser.selectedInFolder,
      unselectedInLocation: presentation.unselectedInLocation,
      guideButtonRef,
      guideOpen,
      onOpenGuide,
      jpgDownloadEnabled: Boolean(gallery.download_jpg_enabled && !readOnly),
      rawDownloadEnabled: Boolean(gallery.download_raw_enabled && !readOnly),
      downloadDisabled: !marks.serverSelectedIds.size || download.downloadBusy || marks.selectionSync.pendingCount > 0,
      downloadBusy: download.downloadBusy,
      downloadState: download.downloadState,
      onDownload,
      messagesEnabled,
      unreadMessages: side.unreadMessages,
      onOpenMessages: side.openMessages,
      qualityEnabled: Boolean(qualityApi),
      canManageQuality,
      qualityStatus: String(quality.qualityJob?.status ?? ""),
      onStartQuality,
      adminToolbarAction,
      selectedImageCount: marks.customerSelectedIds.size,
      onOpenReview: viewer.openReview,
      focusedImageId: browser.focusedImageId,
      onOpenFullscreen: viewer.openFocusedFullscreen,
      adminToolbarStatus,
    },
    folderPanelProps: {
      compactOpen: layout.compactFoldersOpen,
      location: browser.location,
      folderTree: browser.folderTree,
      rootFolderCount: browser.rootView.folders.length,
      totalImageCount,
      hasRootPhotos: presentation.hasRootPhotos,
      rootPhotoCount: presentation.rootPhotoCount,
      filter: filters.filter,
      locationTotalCount: browser.locationTotalCount,
      selectedInFolder: browser.selectedInFolder,
      unselectedInLocation: presentation.unselectedInLocation,
      qualityEnabled: Boolean(qualityApi),
      qualityCounts: browser.qualityCounts,
      qualityState: quality.qualityState,
      qualityJob: quality.qualityJob,
      canManageQuality,
      activeImageCount: browser.activeImageIds.size,
      selectedImageCount: marks.customerSelectedIds.size,
      onCloseCompact: layout.closeCompactFolders,
      onOpenLocation: browser.openLocation,
      onFilterChange: filters.setFilter,
      onControlQuality: quality.controlQuality,
    },
    browserPanelProps: {
      location: browser.location,
      locationLabel: presentation.locationLabel,
      locationCount: presentation.locationCount,
      browserPhotoCount: presentation.browserPhotoCount,
      searchActive: browser.searchActive,
      filenameSearch: filters.filenameSearch,
      searchInputRef: filters.searchInputRef,
      activeRatingFilterName: presentation.activeRatingFilterName,
      activeColorFilterName: presentation.activeColorFilterName,
      labelFilters: filters.labelFilters,
      thumbSize,
      thumbMin: THUMB_MIN,
      thumbMax: THUMB_MAX,
      gridRef,
      thumbnailGridRef,
      childFolders: browser.childFolders,
      hasRootPhotos: presentation.hasRootPhotos,
      rootPhotoCount: presentation.rootPhotoCount,
      virtualTotalHeight: browser.virtualGrid.totalHeight,
      virtualTopPadding: browser.virtualGrid.topPadding,
      virtualBottomPadding: browser.virtualGrid.bottomPadding,
      renderedImages: browser.renderedImages,
      visibleImageCount: browser.visibleImages.length,
      activeImageIds: browser.activeImageIds,
      focusedImageId: browser.focusedImageId,
      customerRatings: marks.customerRatings,
      customerColorLabels: marks.customerColorLabels,
      pendingImageIds: marks.selectionSync.pendingImageIds,
      qualityResults: quality.qualityResults,
      mobile: layout.mobile,
      marquee: browser.marquee,
      onApplyLabelFilterCommand: filters.applyLabelFilterCommand,
      onFilenameSearchChange: filters.setFilenameSearch,
      onClearFilenameSearch: filters.clearFilenameSearch,
      onThumbSizeChange: setThumbSize,
      onOpenLocation: browser.openLocation,
      onPhotoClick: browser.handlePhotoClick,
      onImageError: browser.handleImageError,
      onPointerDown: browser.handlePointerDown,
      onPointerMove: browser.handlePointerMove,
      onPointerUp: browser.handlePointerUp,
    },
    sidePanelProps: {
      sideTab: side.sideTab,
      onSideTabChange: side.setSideTab,
      mobileSideOpen: side.mobileSideOpen,
      onCloseMobile: side.closeMobileSide,
      messagesEnabled,
      unreadMessages: side.unreadMessages,
      activeCount: browser.activeImageIds.size,
      focusedImage,
      orderedIds: browser.orderedIds,
      onFocusImage: browser.setFocusedImageId,
      onOpenFullscreen: viewer.openFullscreen,
      onImageError: browser.handleImageError,
      quality: focusedImage ? quality.qualityResults[focusedImage.id] : undefined,
      canManageQuality,
      onReviewQuality: side.handleQualityReview,
      readOnly,
      rating: focusedImage ? marks.customerRatings[focusedImage.id] ?? 0 : 0,
      colorLabel: focusedImage ? marks.customerColorLabels[focusedImage.id] ?? null : null,
      note: focusedImage ? marks.notes[focusedImage.id] ?? "" : "",
      onRate: side.applyMainRating,
      onColor: side.applyMainColor,
      onNote: side.updateFocusedNote,
      messages: side.messages,
      messageText: side.messageText,
      setMessageText: side.setMessageText,
      messageState: side.messageState,
      messageImageScoped: side.messageImageScoped,
      setMessageImageScoped: side.setMessageImageScoped,
      sendingMessage: side.sendingMessage,
      messagesEndRef: side.messagesEndRef,
      onSendMessage: side.handleSendMessage,
    },
    footerProps: {
      readOnly,
      totalPhotoCount: images.length,
      selectedPhotoCount: marks.customerSelectedIds.size,
      saveStatus: marks.selectionSync.status,
      saveStatusMessage: presentation.saveStatusMessage,
      onRetrySave: marks.selectionSync.retry,
      downloadState: download.downloadState,
      submitError: finalize.submitError,
      canFinalize: reviewer?.can_finalize !== false,
      resetButtonRef: finalize.resetButtonRef,
      resetting: finalize.resetting,
      hasNotes: Boolean(Object.keys(marks.notes).length),
      onReset: finalize.openResetConfirm,
      onReview: viewer.openReview,
      submitting: finalize.submitting,
      pendingCount: marks.selectionSync.pendingCount,
      onSubmit: finalize.openSubmitReview,
    },
    overlayProps: {
      fullscreenImage: viewer.fullscreenImage,
      fullscreenIndex: viewer.fullscreenIndex,
      fullscreenTotal: browser.visibleImages.length,
      zoomed: viewer.zoomed,
      reviewOpen: Boolean(viewer.reviewIds),
      reviewImages: viewer.reviewImages,
      reviewActiveId: viewer.reviewActiveId,
      reviewRemoved: viewer.reviewRemoved,
      ratings: marks.customerRatings,
      colorLabels: marks.customerColorLabels,
      notes: marks.notes,
      guideOpen,
      resetConfirmOpen: finalize.resetConfirmOpen,
      resetting: finalize.resetting,
      submitReviewOpen: finalize.submitReviewOpen,
      submitReviewSections: finalize.submitReviewSections,
      submitReviewItems: finalize.submitReviewItems,
      selectedCount: marks.customerSelectedIds.size,
      submitting: finalize.submitting,
      submitError: finalize.submitError,
      readOnly,
      onToggleFullscreenZoom: viewer.toggleFullscreenZoom,
      onCloseFullscreen: viewer.closeFullscreen,
      onMoveFullscreen: viewer.moveFullscreen,
      onApplyRating: marks.applyRatingTo,
      onToggleColor: marks.toggleColorTo,
      onUpdateNote: marks.updateNote,
      onImageError: browser.handleImageError,
      onSetReviewActive: viewer.setReviewActiveId,
      onCloseReview: viewer.closeReview,
      onRemoveFromReview: viewer.removeFromReview,
      onRestoreReview: viewer.restoreReview,
      onOpenFullscreen: viewer.openFullscreen,
      onCloseGuide,
      onCloseReset: finalize.closeResetConfirm,
      onReset: finalize.resetSelection,
      onCloseSubmitReview: finalize.closeSubmitReview,
      onSubmit: finalize.submit,
    },
  };

  return <CustomerBridgeWorkspaceView {...workspaceProps} />;
}
