"use client";

import {
  useCallback,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import type { BridgeToolKey } from "@/components/olivia-bridge/OliviaBridgeActionBar";
import type { BridgeWorkspaceFileFilter } from "@/components/olivia-bridge/OliviaBridgeFolderPanel";
import type { ExecutionMode } from "@/lib/photo-classifier/photoSource";
import type { BridgeFolderScan } from "@/lib/photo-bridge/bridgeFiles";
import {
  loadLocalBridgeFolderSnapshot,
  loadRemoteBridgeFolderSnapshot,
} from "@/lib/photo-bridge/folderLoader";
import { readBridgeFolderSelectionSource } from "@/lib/photo-bridge/folderSession";
import type {
  BridgeColorLabels,
  BridgeRatingEdits,
} from "@/lib/photo-bridge/labels";
import {
  bridgeRawMatchDefaultFolder,
  bridgeRawMatchFolderCandidates,
  saveBridgeFolderTrail,
  type BridgeFolderTrailItem,
  type BridgeRawFolderCandidate,
} from "@/lib/photo-bridge/recentFolder";
import {
  projectBridgeColorLabelsByName,
  projectBridgeRatingsByName,
} from "@/lib/photo-bridge/selectionProjection";
import { resetBridgeThumbnailCache } from "@/lib/photo-bridge/thumbnailCache";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";

type PreviewSize = { width: number; height: number } | undefined;
type ScanStatus = "idle" | "restoring" | "loading" | "ready" | "error";
type RemoteLoadProgress = { received: number; total: number } | null;

const EMPTY_SCAN: BridgeFolderScan = {
  folders: [],
  jpgs: [],
  raws: [],
  sidecars: [],
  ignoredCount: 0,
  nestedJpgCount: 0,
  unreadableFolderCount: 0,
};

export function useOliviaBridgeFolderLoading({
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
  rememberPublishedRatings,
}: {
  includeNestedJpgs: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  setRemoteLoadProgress: Dispatch<SetStateAction<RemoteLoadProgress>>;
  setExecutionMode: (mode: ExecutionMode) => void;
  setScanStatus: Dispatch<SetStateAction<ScanStatus>>;
  setScanError: Dispatch<SetStateAction<string | undefined>>;
  setToolKey: Dispatch<SetStateAction<BridgeToolKey | undefined>>;
  setSceneReviewOpen: Dispatch<SetStateAction<boolean>>;
  resetSelectionState: (source: BridgeSelectionSource) => void;
  setRatings: Dispatch<SetStateAction<Record<string, number>>>;
  setRatingEdits: Dispatch<SetStateAction<BridgeRatingEdits>>;
  setColorLabels: Dispatch<SetStateAction<BridgeColorLabels>>;
  setExcludedIds: Dispatch<SetStateAction<Set<string>>>;
  setScan: Dispatch<SetStateAction<BridgeFolderScan>>;
  setRemoteFolder: Dispatch<SetStateAction<RemoteNasSelection | null>>;
  setBreadcrumbs: Dispatch<SetStateAction<BridgeFolderTrailItem[]>>;
  setRestoreTrail: Dispatch<SetStateAction<BridgeFolderTrailItem[]>>;
  setRestoreMessage: Dispatch<SetStateAction<string>>;
  resetAdobeMarks: () => void;
  setAnchorId: Dispatch<SetStateAction<string | null>>;
  setFocusedId: Dispatch<SetStateAction<string | null>>;
  setPreviewSize: Dispatch<SetStateAction<PreviewSize>>;
  setFileFilter: Dispatch<SetStateAction<BridgeWorkspaceFileFilter>>;
  setCurrentLocalFolder: (folder: FileSystemDirectoryHandle | null) => void;
  setRawMatchFolderPath: (path: string) => void;
  setRawMatchDefaultFolder: (folder: FileSystemDirectoryHandle | null) => void;
  setRawMatchFolderCandidates: (folders: readonly BridgeRawFolderCandidate[]) => void;
  setJpgRatingsByName: (
    entries: Readonly<Record<string, number | null | undefined>>,
    options?: { overwrite?: boolean },
  ) => void;
  setJpgColorLabelsByName: (
    entries: Readonly<Record<string, number | null | undefined>>,
    options?: { overwrite?: boolean },
  ) => void;
  rememberPublishedRatings: (ratings: Readonly<Record<string, number>>) => void;
}) {
  const remoteLoadGenerationRef = useRef(0);

  const loadDirectory = useCallback(async (
    directory: FileSystemDirectoryHandle,
    trail: BridgeFolderTrailItem[],
    nestedJpgs = includeNestedJpgs,
  ) => {
    remoteLoadGenerationRef.current += 1;
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
      const nextPath = snapshot.folderPath;
      const nextSelectionSource = snapshot.selectionSource;
      const next = snapshot.scan;
      resetSelectionState(nextSelectionSource);
      const restoredMarks = snapshot.marks;
      setRatings(restoredMarks.ratings);
      setRatingEdits(restoredMarks.ratingEdits);
      setColorLabels(restoredMarks.colorLabels);
      setExcludedIds(restoredMarks.excludedIds);
      setScan(next);
      setRemoteFolder(null);
      setBreadcrumbs(trail);
      setRestoreTrail([]);
      setRestoreMessage("");
      resetAdobeMarks();
      setAnchorId(null);
      setFocusedId(next.jpgs[0]?.id ?? null);
      setPreviewSize(undefined);
      setFileFilter("all");
      setCurrentLocalFolder(directory);
      setRawMatchFolderPath(nextPath);
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
  }, [includeNestedJpgs, resetAdobeMarks, resetSelectionState, rootRef, setAnchorId, setBreadcrumbs, setColorLabels, setCurrentLocalFolder, setExcludedIds, setExecutionMode, setFileFilter, setFocusedId, setJpgColorLabelsByName, setJpgRatingsByName, setPreviewSize, setRatingEdits, setRatings, setRawMatchDefaultFolder, setRawMatchFolderCandidates, setRawMatchFolderPath, setRemoteFolder, setRemoteLoadProgress, setRestoreMessage, setRestoreTrail, setScan, setScanError, setScanStatus, setSceneReviewOpen, setToolKey]);

  const loadRemoteDirectory = useCallback(async (selection: RemoteNasSelection) => {
    const generation = ++remoteLoadGenerationRef.current;
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
          if (generation !== remoteLoadGenerationRef.current) return;
          setScan({ ...EMPTY_SCAN, jpgs: progress.jpgs });
          setRemoteLoadProgress({ received: progress.received, total: progress.total });
          setFocusedId((current) => current ?? progress.jpgs[0]?.id ?? null);
        },
      });
      if (generation !== remoteLoadGenerationRef.current) return;
      const jpgs = snapshot.jpgs;
      setScan({ ...EMPTY_SCAN, jpgs });
      rememberPublishedRatings({});
      setJpgRatingsByName(projectBridgeRatingsByName(jpgs, {}), { overwrite: true });
      setJpgColorLabelsByName(projectBridgeColorLabelsByName(jpgs, {}), { overwrite: true });
      setFocusedId(jpgs[0]?.id ?? null);
      setScanStatus("ready");
      setRemoteLoadProgress(null);
      rootRef.current?.focus();
    } catch (error) {
      if (generation !== remoteLoadGenerationRef.current) return;
      console.error("[olivia-bridge] Failed to read remote folder", error);
      setScanStatus("error");
      setRemoteLoadProgress(null);
      setScanError(error instanceof Error ? error.message : "원격 썸네일을 읽지 못했습니다.");
    }
  }, [rememberPublishedRatings, resetAdobeMarks, resetSelectionState, rootRef, setAnchorId, setBreadcrumbs, setColorLabels, setCurrentLocalFolder, setExcludedIds, setFocusedId, setJpgColorLabelsByName, setJpgRatingsByName, setPreviewSize, setRatingEdits, setRatings, setRawMatchFolderPath, setRemoteFolder, setRemoteLoadProgress, setScan, setScanError, setScanStatus, setSceneReviewOpen, setToolKey]);

  return { loadDirectory, loadRemoteDirectory };
}
