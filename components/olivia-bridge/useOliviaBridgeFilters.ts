"use client";

import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";

import type {
  BridgeWorkspaceFileFilter,
  BridgeWorkspaceQualityFilter,
} from "@/components/olivia-bridge/OliviaBridgeFolderPanel";
import {
  EMPTY_BRIDGE_LABEL_FILTERS,
  updateBridgeLabelFilters,
  type BridgeLabelFilterCommand,
  type BridgeLabelFilters,
} from "@/lib/photo-bridge/labels";
import { useBridgeSearchFilterShortcuts } from "@/lib/photo-bridge/useBridgeSearchFilterShortcuts";

export function useOliviaBridgeFilters({
  searchInputRef,
  compactFilterButtonRef,
  folderPanelRef,
  fullscreenPreviewOpen,
  closeFullscreenPreview,
  resetComparisonFilter,
}: {
  searchInputRef: RefObject<HTMLInputElement | null>;
  compactFilterButtonRef: RefObject<HTMLButtonElement | null>;
  folderPanelRef: RefObject<HTMLElement | null>;
  fullscreenPreviewOpen: boolean;
  closeFullscreenPreview: () => void;
  resetComparisonFilter: () => void;
}) {
  const [fileFilter, setFileFilter] = useState<BridgeWorkspaceFileFilter>("all");
  const [labelFilters, setLabelFilters] = useState<BridgeLabelFilters>(() => ({ ...EMPTY_BRIDGE_LABEL_FILTERS }));
  const [filenameSearch, setFilenameSearch] = useState("");
  const [qualityFilter, setQualityFilter] = useState<BridgeWorkspaceQualityFilter>("all");
  const [compactFiltersOpen, setCompactFiltersOpen] = useState(false);

  const applyLabelFilterCommand = useCallback((command: BridgeLabelFilterCommand) => {
    if (fullscreenPreviewOpen) closeFullscreenPreview();
    if (command.kind === "all") {
      setLabelFilters({ ...EMPTY_BRIDGE_LABEL_FILTERS });
      setFileFilter("all");
      resetComparisonFilter();
      setQualityFilter("all");
      return;
    }
    setLabelFilters((current) => updateBridgeLabelFilters(current, command));
    setFileFilter("jpg");
  }, [closeFullscreenPreview, fullscreenPreviewOpen, resetComparisonFilter]);

  const chooseFileFilter = useCallback((filter: BridgeWorkspaceFileFilter) => {
    setLabelFilters({ ...EMPTY_BRIDGE_LABEL_FILTERS });
    setFileFilter(filter);
  }, []);

  const handleSearchFilterShortcut = useBridgeSearchFilterShortcuts({
    searchInputRef,
    searchQuery: filenameSearch,
    onSearchQueryChange: setFilenameSearch,
    onFilterCommand: applyLabelFilterCommand,
  });

  useEffect(() => {
    const handleUnfocusedBridgeShortcut = (event: KeyboardEvent) => {
      if (event.target !== document.body && event.target !== document.documentElement) return;
      handleSearchFilterShortcut(event);
    };
    window.addEventListener("keydown", handleUnfocusedBridgeShortcut);
    return () => window.removeEventListener("keydown", handleUnfocusedBridgeShortcut);
  }, [handleSearchFilterShortcut]);

  const openCompactFilters = useCallback(() => setCompactFiltersOpen(true), []);
  const closeCompactFilters = useCallback(() => {
    setCompactFiltersOpen(false);
    window.requestAnimationFrame(() => compactFilterButtonRef.current?.focus());
  }, [compactFilterButtonRef]);

  useEffect(() => {
    if (!compactFiltersOpen) return;
    folderPanelRef.current?.focus();
  }, [compactFiltersOpen, folderPanelRef]);

  const clearFilenameSearch = useCallback(() => {
    setFilenameSearch("");
    searchInputRef.current?.focus();
  }, [searchInputRef]);

  return {
    fileFilter,
    setFileFilter,
    labelFilters,
    filenameSearch,
    setFilenameSearch,
    clearFilenameSearch,
    qualityFilter,
    setQualityFilter,
    compactFiltersOpen,
    openCompactFilters,
    closeCompactFilters,
    applyLabelFilterCommand,
    chooseFileFilter,
    handleSearchFilterShortcut,
  };
}
