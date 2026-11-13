"use client";

import { useCallback, type MutableRefObject } from "react";

import type { OliviaBridgeFolderLoadingBindings } from "@/components/olivia-bridge/oliviaBridgeFolderLoadingTypes";
import { loadLocalBridgeFolderSnapshot } from "@/lib/photo-bridge/folderLoader";
import {
  bridgeRawMatchDefaultFolder,
  bridgeRawMatchFolderCandidates,
  saveBridgeFolderTrail,
  type BridgeFolderTrailItem,
} from "@/lib/photo-bridge/recentFolder";
import { resetBridgeThumbnailCache } from "@/lib/photo-bridge/thumbnailCache";

export function useOliviaBridgeLocalFolderLoading(
  bindings: OliviaBridgeFolderLoadingBindings,
  loadGenerationRef: MutableRefObject<number>,
) {
  const {
    includeNestedJpgs,
    rootRef,
    setRemoteLoadProgress,
    setExecutionMode,
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
    setRestoreTrail,
    setRestoreMessage,
    resetAdobeMarks,
    setAnchorId,
    setFocusedId,
    setPreviewSize,
    setFileFilter,
    setCurrentLocalFolder,
    setRawMatchFolderPath,
    setRawMatchDefaultFolder,
    setRawMatchFolderCandidates,
    setJpgRatingsByName,
    setJpgColorLabelsByName,
  } = bindings;

  return useCallback(async (
    directory: FileSystemDirectoryHandle,
    trail: BridgeFolderTrailItem[],
    nestedJpgs = includeNestedJpgs,
  ) => {
    loadGenerationRef.current += 1;
    resetBridgeThumbnailCache();
    setRemoteLoadProgress(null);
    setExecutionMode("LOCAL_DIRECT");
    setScanStatus("loading");
    setScanError(undefined);
    setToolKey(undefined);
    setSceneReviewOpen(false);
    try {
      const snapshot = await loadLocalBridgeFolderSnapshot({
        directory,
        trail,
        includeNestedJpgs: nestedJpgs,
        storage: localStorage,
      });
      resetSelectionState(snapshot.selectionSource);
      setRatings(snapshot.marks.ratings);
      setRatingEdits(snapshot.marks.ratingEdits);
      setColorLabels(snapshot.marks.colorLabels);
      setExcludedIds(snapshot.marks.excludedIds);
      setScan(snapshot.scan);
      setRemoteFolder(null);
      setBreadcrumbs(trail);
      setRestoreTrail([]);
      setRestoreMessage("");
      resetAdobeMarks();
      setAnchorId(null);
      setFocusedId(snapshot.scan.jpgs[0]?.id ?? null);
      setPreviewSize(undefined);
      setFileFilter("all");
      setCurrentLocalFolder(directory);
      setRawMatchFolderPath(snapshot.folderPath);
      setRawMatchDefaultFolder(bridgeRawMatchDefaultFolder(trail));
      setRawMatchFolderCandidates(bridgeRawMatchFolderCandidates(trail));
      setJpgRatingsByName(snapshot.marksByName.ratings, { overwrite: true });
      setJpgColorLabelsByName(snapshot.marksByName.colorLabels, { overwrite: true });
      setScanStatus("ready");
      void saveBridgeFolderTrail(trail).catch((error) => {
        console.error("[olivia-bridge] Failed to remember the last folder", error);
      });
      rootRef.current?.focus();
    } catch (error) {
      console.error("[olivia-bridge] Failed to read local folder", error);
      setScanStatus("error");
      setScanError(error instanceof Error ? error.message : "폴더를 읽지 못했습니다.");
    }
  }, [
    includeNestedJpgs,
    loadGenerationRef,
    resetAdobeMarks,
    resetSelectionState,
    rootRef,
    setAnchorId,
    setBreadcrumbs,
    setColorLabels,
    setCurrentLocalFolder,
    setExcludedIds,
    setExecutionMode,
    setFileFilter,
    setFocusedId,
    setJpgColorLabelsByName,
    setJpgRatingsByName,
    setPreviewSize,
    setRatingEdits,
    setRatings,
    setRawMatchDefaultFolder,
    setRawMatchFolderCandidates,
    setRawMatchFolderPath,
    setRemoteFolder,
    setRemoteLoadProgress,
    setRestoreMessage,
    setRestoreTrail,
    setScan,
    setScanError,
    setScanStatus,
    setSceneReviewOpen,
    setToolKey,
  ]);
}
