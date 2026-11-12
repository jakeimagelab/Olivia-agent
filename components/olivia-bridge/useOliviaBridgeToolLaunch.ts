"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { BridgeToolKey } from "@/components/olivia-bridge/OliviaBridgeActionBar";
import type { BridgeSelectedIdsUpdater } from "@/components/olivia-bridge/useOliviaBridgeSelectionState";
import {
  resolveBridgeToolSelection,
  type BridgeJpgFile,
} from "@/lib/photo-bridge/bridgeFiles";
import { projectBridgeSelectedFiles } from "@/lib/photo-bridge/selectionProjection";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";

export function useOliviaBridgeToolLaunch({
  currentLocalFolder,
  remoteFolder,
  scanStatus,
  selectedIds,
  selectedIdsRef,
  visibleJpgs,
  breadcrumbsLength,
  setSelectedIds,
  setSelectedJpgFiles,
  setSceneReviewOpen,
  syncAdobeBridgeSelection,
  openRawRootPrompt,
  setToolKey,
}: {
  currentLocalFolder: FileSystemDirectoryHandle | null;
  remoteFolder: RemoteNasSelection | null;
  scanStatus: "idle" | "restoring" | "loading" | "ready" | "error";
  selectedIds: ReadonlySet<string>;
  selectedIdsRef: { current: Set<string> };
  visibleJpgs: readonly BridgeJpgFile[];
  breadcrumbsLength: number;
  setSelectedIds: (value: BridgeSelectedIdsUpdater) => void;
  setSelectedJpgFiles: (files: readonly File[]) => void;
  setSceneReviewOpen: Dispatch<SetStateAction<boolean>>;
  syncAdobeBridgeSelection: () => void | Promise<void>;
  openRawRootPrompt: () => void;
  setToolKey: Dispatch<SetStateAction<BridgeToolKey | undefined>>;
}) {
  const openTool = useCallback((key: BridgeToolKey) => {
    if (!currentLocalFolder && !(remoteFolder && key === "classification")) return;
    const toolSelection = resolveBridgeToolSelection(
      selectedIdsRef.current,
      visibleJpgs.map((photo) => photo.id),
    );
    if (!toolSelection.size) return;
    if (!selectedIdsRef.current.size) {
      setSelectedIds(toolSelection);
      setSelectedJpgFiles(projectBridgeSelectedFiles(visibleJpgs, toolSelection));
    }
    setSceneReviewOpen(false);
    if (key === "classification") {
      setToolKey(undefined);
      setSceneReviewOpen(true);
      void syncAdobeBridgeSelection();
      return;
    }
    if (key === "raw-match" && breadcrumbsLength < 3) {
      openRawRootPrompt();
      return;
    }
    setToolKey(key);
  }, [breadcrumbsLength, currentLocalFolder, openRawRootPrompt, remoteFolder, selectedIdsRef, setSceneReviewOpen, setSelectedIds, setSelectedJpgFiles, setToolKey, syncAdobeBridgeSelection, visibleJpgs]);

  const toolDisabledReason = useCallback((key: BridgeToolKey) => {
    if (scanStatus !== "ready") return "사진 폴더를 먼저 선택해 주세요.";
    if (!selectedIds.size && !visibleJpgs.length) return "현재 화면에 작업할 JPG가 없습니다.";
    if (currentLocalFolder) return undefined;
    if (remoteFolder && key === "classification") return undefined;
    if (remoteFolder) return "이 도구는 현재 로컬 폴더에서만 실행할 수 있습니다.";
    return "사진 폴더를 먼저 선택해 주세요.";
  }, [currentLocalFolder, remoteFolder, scanStatus, selectedIds.size, visibleJpgs.length]);

  return { openTool, toolDisabledReason };
}
