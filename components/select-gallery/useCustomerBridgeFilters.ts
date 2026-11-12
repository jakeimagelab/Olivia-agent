"use client";

import { useCallback, useRef, useState } from "react";
import {
  EMPTY_BRIDGE_LABEL_FILTERS,
  updateBridgeLabelFilters,
  type BridgeLabelFilterCommand,
  type BridgeLabelFilters,
} from "@/lib/photo-bridge/labels";
import { useBridgeSearchFilterShortcuts } from "@/lib/photo-bridge/useBridgeSearchFilterShortcuts";
import type { CustomerBridgePhotoFilter as PhotoFilter } from "@/lib/select-gallery/customerBridgeView";

export function useCustomerBridgeFilters({ onBeforeFilterChange }: { onBeforeFilterChange: () => void }) {
  const [filter, setFilter] = useState<PhotoFilter>("all");
  const [labelFilters, setLabelFilters] = useState<BridgeLabelFilters>(() => ({ ...EMPTY_BRIDGE_LABEL_FILTERS }));
  const [filenameSearch, setFilenameSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const clearFilenameSearch = useCallback(() => {
    setFilenameSearch("");
    searchInputRef.current?.focus();
  }, []);
  const applyLabelFilterCommand = useCallback((command: BridgeLabelFilterCommand) => {
    onBeforeFilterChange();
    if (command.kind === "all") {
      setLabelFilters({ ...EMPTY_BRIDGE_LABEL_FILTERS });
      setFilter("all");
      return;
    }
    setLabelFilters((current) => updateBridgeLabelFilters(current, command));
  }, [onBeforeFilterChange]);
  const handleSearchFilterShortcut = useBridgeSearchFilterShortcuts({
    searchInputRef,
    searchQuery: filenameSearch,
    onSearchQueryChange: setFilenameSearch,
    onFilterCommand: applyLabelFilterCommand,
  });

  return {
    filter,
    setFilter,
    labelFilters,
    filenameSearch,
    setFilenameSearch,
    searchInputRef,
    clearFilenameSearch,
    applyLabelFilterCommand,
    handleSearchFilterShortcut,
  };
}
