"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

import type { BridgeLabelFilters } from "@/lib/photo-bridge/labels";
import type {
  PersonSelectClientImagePageState,
  PersonSelectClientImageQuery,
} from "@/lib/person-select/imagePageClient";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import {
  buildCustomerBridgePhotoView,
  type CustomerBridgePhotoFilter,
} from "@/lib/select-gallery/customerBridgeView";
import type {
  CustomerBridgeColorLabel,
  CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import type {
  CustomerBridgeFolderManifest,
  CustomerBridgeImage,
} from "@/lib/select-gallery/customerBridgeTypes";
import { useCustomerBridgeActiveSelection } from "./useCustomerBridgeActiveSelection";
import { useCustomerBridgeImagePaging } from "./useCustomerBridgeImagePaging";
import { useCustomerBridgeLocation } from "./useCustomerBridgeLocation";
import { useVirtualPhotoGrid } from "./useVirtualPhotoGrid";

type CustomerBridgeBrowserControllerOptions = {
  images: CustomerBridgeImage[];
  manifest?: CustomerBridgeFolderManifest | null;
  storageScope: string;
  filter: CustomerBridgePhotoFilter;
  filenameSearch: string;
  labelFilters: BridgeLabelFilters;
  selectedIds: ReadonlySet<string>;
  ratings: Readonly<Record<string, CustomerBridgeRating>>;
  colorLabels: Readonly<Record<string, CustomerBridgeColorLabel>>;
  qualityResults: Readonly<Record<string, PublicPhotoQualityResult>>;
  mobile: boolean;
  readOnly: boolean;
  thumbSize: number;
  gridRef: RefObject<HTMLDivElement | null>;
  thumbnailGridRef: RefObject<HTMLDivElement | null>;
  onCloseCompactFolders: () => void;
  onStorageError: (scope: string, error: unknown) => void;
  loadNextImagePage?: (query: PersonSelectClientImageQuery) => Promise<boolean>;
  ensureImagePage?: (query: PersonSelectClientImageQuery) => Promise<boolean>;
  getImagePageState?: (query: PersonSelectClientImageQuery) => PersonSelectClientImagePageState;
};

export function useCustomerBridgeBrowserController({
  images,
  manifest,
  storageScope,
  filter,
  filenameSearch,
  labelFilters,
  selectedIds,
  ratings,
  colorLabels,
  qualityResults,
  mobile,
  readOnly,
  thumbSize,
  gridRef,
  thumbnailGridRef,
  onCloseCompactFolders,
  onStorageError,
  loadNextImagePage,
  ensureImagePage,
  getImagePageState,
}: CustomerBridgeBrowserControllerOptions) {
  const locationSelectionResetRef = useRef<(nextImages: readonly CustomerBridgeImage[]) => void>(() => undefined);
  const mobileImageOpenerRef = useRef<(imageId: string) => void>(() => undefined);
  const openMobileImage = useCallback((imageId: string) => mobileImageOpenerRef.current(imageId), []);
  const setMobileImageOpener = useCallback((opener: (imageId: string) => void) => {
    mobileImageOpenerRef.current = opener;
  }, []);

  const locationController = useCustomerBridgeLocation({
    images,
    manifest,
    storageScope,
    onLocationOpened: (nextImages) => locationSelectionResetRef.current(nextImages),
    onStorageError,
  });
  const {
    location,
    folderImages,
  } = locationController;
  const photoView = useMemo(() => buildCustomerBridgePhotoView({
    images: folderImages,
    filter,
    filenameSearch,
    labelFilters,
    selectedIds,
    ratings,
    colorLabels,
    qualityResults,
  }), [colorLabels, filenameSearch, filter, folderImages, labelFilters, qualityResults, ratings, selectedIds]);
  const {
    visibleImages,
    selectedInFolder,
    qualityCounts,
    searchActive,
  } = photoView;
  const { state: imagePageState, requestNext: requestNextImagePage } = useCustomerBridgeImagePaging({
    location,
    filenameSearch,
    loadNextImagePage,
    ensureImagePage,
    getImagePageState,
  });
  const orderedIds = useMemo(() => visibleImages.map((image) => image.id), [visibleImages]);
  const activeSelection = useCustomerBridgeActiveSelection({
    orderedIds,
    mobile,
    readOnly,
    gridRef,
    onMobileOpen: openMobileImage,
  });
  locationSelectionResetRef.current = (nextImages) => {
    activeSelection.resetLocationSelection(nextImages);
    onCloseCompactFolders();
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
    if (!activeSelection.focusedImageId || location.kind === "root") return;
    if (gridRef.current?.querySelector(`[data-bridge-image-id="${CSS.escape(activeSelection.focusedImageId)}"]`)) return;
    scrollToVirtualIndex(orderedIds.indexOf(activeSelection.focusedImageId));
  }, [activeSelection.focusedImageId, gridRef, location.kind, orderedIds, scrollToVirtualIndex]);

  return {
    ...locationController,
    ...photoView,
    ...activeSelection,
    imagePageState,
    orderedIds,
    virtualGrid,
    renderedImages,
    setMobileImageOpener,
  };
}
