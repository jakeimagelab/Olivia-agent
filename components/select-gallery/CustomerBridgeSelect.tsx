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
import {
  useCustomerBridgeMarksController,
  type CustomerBridgeInitialSelection,
} from "./useCustomerBridgeMarksController";
import { useCustomerBridgeWorkspaceLayout } from "./useCustomerBridgeWorkspaceLayout";
import { useCustomerBridgeFilters } from "./useCustomerBridgeFilters";
import { useCustomerBridgeDraftRefresh } from "./useCustomerBridgeDraftRefresh";
import { useCustomerBridgeBrowserController } from "./useCustomerBridgeBrowserController";
import { useCustomerBridgeInteractionControllers } from "./useCustomerBridgeInteractionControllers";
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
  topContent,
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
  topContent?: ReactNode;
  imageManifest?: CustomerBridgeFolderManifest | null;
  loadNextImagePage?: (query: PersonSelectClientImageQuery) => Promise<boolean>;
  ensureImagePage?: (query: PersonSelectClientImageQuery) => Promise<boolean>;
  getImagePageState?: (query: PersonSelectClientImageQuery) => PersonSelectClientImagePageState;
}) {
  const endpointBase = apiBase ?? `/api/select/${shareToken}`;
  const localStorageScope = storageScope ?? shareToken;
  const mediaController = useCustomerBridgeMediaStore({
    initialImages,
    refreshImageUrl,
    loadImageUrls,
  });
  const { images, handleImageError } = mediaController;
  const marksController = useCustomerBridgeMarksController({
    endpointBase,
    localStorageScope,
    initialDraft,
    initialSelection,
    readOnly,
  });
  const {
    customerRatings,
    customerColorLabels,
    customerSelectedIds,
    getPendingSelectionDiffs,
    installServerSnapshot,
    applyRatingTo,
    toggleColorTo,
  } = marksController;
  useCustomerBridgeDraftRefresh({
    enabled: !readOnly,
    endpointBase,
    installServerSnapshot,
    getPendingSelectionDiffs,
  });
  const fullscreenCloseRef = useRef<() => void>(() => undefined);
  const closeFullscreenBeforeFilterChange = useCallback(() => fullscreenCloseRef.current(), []);
  const filtersController = useCustomerBridgeFilters({ onBeforeFilterChange: closeFullscreenBeforeFilterChange });
  const {
    filter,
    setFilter,
    labelFilters,
    filenameSearch,
    handleSearchFilterShortcut,
  } = filtersController;
  const [thumbSize, setThumbSize] = useState(156);
  const layoutController = useCustomerBridgeWorkspaceLayout();
  const {
    setCompactFoldersOpen,
    mobile,
    closeCompactFolders,
  } = layoutController;
  const [guideOpen, setGuideOpen] = useState(false);
  const openGuide = useCallback(() => setGuideOpen(true), []);

  const gridRef = useRef<HTMLDivElement>(null);
  const thumbnailGridRef = useRef<HTMLDivElement>(null);
  const guideButtonRef = useRef<HTMLButtonElement>(null);

  const qualityController = useCustomerBridgeQuality({
    qualityApi,
    canManageQuality,
  });
  const { qualityResults, startQuality } = qualityController;

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
    orderedIds,
    focusedImageId,
    setFocusedImageId,
    activeImageIds,
    setActiveImageIds,
    anchorId,
    setAnchorId,
  } = browserController;
  const {
    download: downloadController,
    handleDownload,
    focusedImage,
    viewer: viewerController,
    finalize: finalizeController,
    side: sideController,
  } = useCustomerBridgeInteractionControllers({
    endpointBase,
    localStorageScope,
    readOnly,
    messagesEnabled,
    mobile,
    images,
    media: mediaController,
    marks: marksController,
    browser: browserController,
    quality: qualityController,
    fullscreenCloseRef,
    onSubmitted,
    setFilter,
    onStorageError: reportOptionalStorageError,
  });
  const {
    mobileSideOpen,
    setMobileSideOpen,
  } = sideController;
  const {
    fullscreenId,
    openFullscreen,
    closeFullscreen,
    moveFullscreen,
    reviewIds,
    reviewActiveId,
    reviewRemoved,
    openReview,
    closeReview,
    moveReview,
    removeFromReview,
    restoreReview,
  } = viewerController;
  const { resetConfirmOpen, closeResetConfirm } = finalizeController;
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
    topContent={topContent}
    imageManifest={imageManifest}
    images={images}
    focusedImage={focusedImage}
    thumbSize={thumbSize}
    setThumbSize={setThumbSize}
    guideOpen={guideOpen}
    guideButtonRef={guideButtonRef}
    gridRef={gridRef}
    thumbnailGridRef={thumbnailGridRef}
    layout={layoutController}
    filters={filtersController}
    marks={marksController}
    browser={{ ...browserController, handleImageError }}
    download={downloadController}
    viewer={viewerController}
    finalize={finalizeController}
    side={sideController}
    quality={qualityController}
    onOpenGuide={openGuide}
    onCloseGuide={closeGuide}
    onDownload={handleDownload}
    onStartQuality={startQualityAnalysis}
  />;
}
