"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  resolveBridgeManualSelectionChange,
  sameBridgeIdSet,
} from "@/lib/photo-bridge/selectionChange";
import {
  projectBridgeSelectedFiles,
  projectBridgeSelectedNames,
  resolveBridgeSelectedIdsByName,
} from "@/lib/photo-bridge/selectionProjection";
import {
  DEFAULT_BRIDGE_SELECTION_SOURCE,
  resolveBridgeSelection,
  type BridgeSelectionSource,
} from "@/lib/photo-bridge/toolLinkage";

export type BridgeSelectedIdsUpdater = Set<string> | ((current: Set<string>) => Set<string>);

export function useOliviaBridgeSelectionState({
  jpgs,
  selectedJpgNames,
  setSelectedJpgNames,
  setSelectedJpgFiles,
}: {
  jpgs: readonly BridgeJpgFile[];
  selectedJpgNames: readonly string[];
  setSelectedJpgNames: (names: readonly string[]) => void;
  setSelectedJpgFiles: (files: readonly File[]) => void;
}) {
  const [selectedIds, setSelectedIdsState] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const manualSelectedIdsRef = useRef<Set<string>>(new Set());
  const adobeSelectedIdsRef = useRef<Set<string>>(new Set());
  const manualRemovedIdsRef = useRef<Set<string>>(new Set());
  const [selectionSource, setSelectionSourceState] = useState<BridgeSelectionSource>(DEFAULT_BRIDGE_SELECTION_SOURCE);
  const selectionSourceRef = useRef<BridgeSelectionSource>(DEFAULT_BRIDGE_SELECTION_SOURCE);

  const commitSelectedIds = useCallback((
    manual: ReadonlySet<string>,
    adobe: ReadonlySet<string>,
    source = selectionSourceRef.current,
  ) => {
    const nextManual = new Set(manual);
    const nextAdobe = new Set(adobe);
    const next = resolveBridgeSelection(source, nextManual, nextAdobe, manualRemovedIdsRef.current);
    manualSelectedIdsRef.current = nextManual;
    adobeSelectedIdsRef.current = nextAdobe;
    selectedIdsRef.current = next;
    setSelectedIdsState(next);
    setSelectedJpgNames(projectBridgeSelectedNames(jpgs, next));
  }, [jpgs, setSelectedJpgNames]);

  const setSelectedIds = useCallback((value: BridgeSelectedIdsUpdater) => {
    if (selectionSourceRef.current === "adobe") return;
    const requested = typeof value === "function" ? value(selectedIdsRef.current) : value;
    const change = resolveBridgeManualSelectionChange({
      source: selectionSourceRef.current,
      requestedIds: requested,
      currentSelectedIds: selectedIdsRef.current,
      manualIds: manualSelectedIdsRef.current,
      adobeIds: adobeSelectedIdsRef.current,
      manualRemovedIds: manualRemovedIdsRef.current,
    });
    manualRemovedIdsRef.current = change.manualRemovedIds;
    commitSelectedIds(change.manualIds, adobeSelectedIdsRef.current);
  }, [commitSelectedIds]);

  const activateSelectionSource = useCallback((source: BridgeSelectionSource) => {
    selectionSourceRef.current = source;
    setSelectionSourceState(source);
    commitSelectedIds(manualSelectedIdsRef.current, adobeSelectedIdsRef.current, source);
  }, [commitSelectedIds]);

  const resetSelectionState = useCallback((source: BridgeSelectionSource) => {
    selectionSourceRef.current = source;
    setSelectionSourceState(source);
    manualRemovedIdsRef.current = new Set();
    commitSelectedIds(new Set(), new Set(), source);
  }, [commitSelectedIds]);

  useEffect(() => {
    setSelectedJpgFiles(projectBridgeSelectedFiles(jpgs, selectedIds));
  }, [jpgs, selectedIds, setSelectedJpgFiles]);

  useEffect(() => {
    const next = resolveBridgeSelectedIdsByName(jpgs, selectedJpgNames);
    if (sameBridgeIdSet(selectedIdsRef.current, next)) return;
    setSelectedIds(next);
  }, [jpgs, selectedJpgNames, setSelectedIds]);

  return {
    selectedIds,
    selectedIdsRef,
    manualSelectedIdsRef,
    adobeSelectedIdsRef,
    manualRemovedIdsRef,
    selectionSource,
    selectionSourceRef,
    commitSelectedIds,
    setSelectedIds,
    activateSelectionSource,
    resetSelectionState,
  };
}
