"use client";

import { useCallback, type MutableRefObject } from "react";

import type { OliviaBridgeFolderLoadingBindings } from "@/components/olivia-bridge/oliviaBridgeFolderLoadingTypes";
import type { BridgeFolderScan } from "@/lib/photo-bridge/bridgeFiles";
import { loadRemoteBridgeFolderSnapshot } from "@/lib/photo-bridge/folderLoader";
import { readBridgeFolderSelectionSource } from "@/lib/photo-bridge/folderSession";
import {
  projectBridgeColorLabelsByName,
  projectBridgeRatingsByName,
} from "@/lib/photo-bridge/selectionProjection";
import { resetBridgeThumbnailCache } from "@/lib/photo-bridge/thumbnailCache";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";

const EMPTY_SCAN: BridgeFolderScan = {
  folders: [],
  jpgs: [],
  raws: [],
  sidecars: [],
  ignoredCount: 0,
  nestedJpgCount: 0,
  unreadableFolderCount: 0,
};

export function useOliviaBridgeRemoteFolderLoading(
  bindings: OliviaBridgeFolderLoadingBindings,
  loadGenerationRef: MutableRefObject<number>,
) {
  const {
    rootRef,
    setRemoteLoadProgress,
    setScanStatus,
    setScanError,
    setToolKey,
    setSceneReviewOpen,
    resetSelectionState,
    setRatings,
    setRatingEdits,
    setColorLabels,
    setExcludedIds,
    setScan,
    setRemoteFolder,
    setBreadcrumbs,
    resetAdobeMarks,
    setAnchorId,
    setFocusedId,
    setPreviewSize,
    setCurrentLocalFolder,
    setRawMatchFolderPath,
    setJpgRatingsByName,
    setJpgColorLabelsByName,
    rememberPublishedRatings,
  } = bindings;

  return useCallback(async (selection: RemoteNasSelection) => {
    const generation = ++loadGenerationRef.current;
    resetBridgeThumbnailCache();
    setRemoteLoadProgress(null);
    setScanStatus("loading");
    setScanError(undefined);
    setToolKey(undefined);
    setSceneReviewOpen(false);
    setRemoteFolder(selection);
    const nextSelectionSource = readBridgeFolderSelectionSource(localStorage, selection.path);
    resetSelectionState(nextSelectionSource);
    setScan(EMPTY_SCAN);
    setBreadcrumbs([]);
    setCurrentLocalFolder(null);
    setRawMatchFolderPath(selection.path);
    setAnchorId(null);
    setFocusedId(null);
    setPreviewSize(undefined);
    setRatings({});
    resetAdobeMarks();
    setRatingEdits({});
    setColorLabels({});
    setExcludedIds(new Set());
    try {
      const snapshot = await loadRemoteBridgeFolderSnapshot({
        selection,
        storage: localStorage,
        selectionSource: nextSelectionSource,
        onProgress: (progress) => {
          if (generation !== loadGenerationRef.current) return;
          setScan({ ...EMPTY_SCAN, jpgs: progress.jpgs });
          setRemoteLoadProgress({ received: progress.received, total: progress.total });
          setFocusedId((current) => current ?? progress.jpgs[0]?.id ?? null);
        },
      });
      if (generation !== loadGenerationRef.current) return;
      setScan({ ...EMPTY_SCAN, jpgs: snapshot.jpgs });
      rememberPublishedRatings({});
      setJpgRatingsByName(projectBridgeRatingsByName(snapshot.jpgs, {}), { overwrite: true });
      setJpgColorLabelsByName(projectBridgeColorLabelsByName(snapshot.jpgs, {}), { overwrite: true });
      setFocusedId(snapshot.jpgs[0]?.id ?? null);
      setScanStatus("ready");
      setRemoteLoadProgress(null);
      rootRef.current?.focus();
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      console.error("[olivia-bridge] Failed to read remote folder", error);
      setScanStatus("error");
      setRemoteLoadProgress(null);
      setScanError(error instanceof Error ? error.message : "원격 썸네일을 읽지 못했습니다.");
    }
  }, [
    loadGenerationRef,
    rememberPublishedRatings,
    resetAdobeMarks,
    resetSelectionState,
    rootRef,
    setAnchorId,
    setBreadcrumbs,
    setColorLabels,
    setCurrentLocalFolder,
    setExcludedIds,
    setFocusedId,
    setJpgColorLabelsByName,
    setJpgRatingsByName,
    setPreviewSize,
    setRatingEdits,
    setRatings,
    setRawMatchFolderPath,
    setRemoteFolder,
    setRemoteLoadProgress,
    setScan,
    setScanError,
    setScanStatus,
    setSceneReviewOpen,
    setToolKey,
  ]);
}
