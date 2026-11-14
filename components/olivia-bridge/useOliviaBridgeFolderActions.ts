"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import type { BridgeToolKey } from "@/components/olivia-bridge/OliviaBridgeActionBar";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import {
  bridgeRawMatchDefaultFolder,
  bridgeRawMatchFolderCandidates,
  resolveBridgeFolderTrail,
  saveBridgeFolderTrail,
  type BridgeFolderTrailItem,
  type BridgeRawFolderCandidate,
} from "@/lib/photo-bridge/recentFolder";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { useDesktopWindowMode, useDesktopWindowRoute } from "@/lib/desktopWindowContext";

export function useOliviaBridgeFolderActions({
  clientId,
  workflowRunId,
  activeFolder,
  activeFolderName,
  breadcrumbs,
  rootRef,
  loadDirectory,
  loadRemoteDirectory,
  setIncludeNestedJpgs,
  setBreadcrumbs,
  setRawMatchFolderPath,
  setRawMatchDefaultFolder,
  setRawMatchFolderCandidates,
  setExecutionMode,
  setToolKey,
  showTopNotice,
}: {
  clientId?: string;
  workflowRunId?: string;
  activeFolder: FileSystemDirectoryHandle | null;
  activeFolderName: string;
  breadcrumbs: BridgeFolderTrailItem[];
  rootRef: RefObject<HTMLDivElement | null>;
  loadDirectory: (
    directory: FileSystemDirectoryHandle,
    trail: BridgeFolderTrailItem[],
    nestedJpgs?: boolean,
  ) => Promise<void>;
  loadRemoteDirectory: (selection: RemoteNasSelection) => Promise<void>;
  setIncludeNestedJpgs: Dispatch<SetStateAction<boolean>>;
  setBreadcrumbs: Dispatch<SetStateAction<BridgeFolderTrailItem[]>>;
  setRawMatchFolderPath: (path: string) => void;
  setRawMatchDefaultFolder: (folder: FileSystemDirectoryHandle | null) => void;
  setRawMatchFolderCandidates: (folders: readonly BridgeRawFolderCandidate[]) => void;
  setExecutionMode: (mode: "LOCAL_DIRECT" | "REMOTE_WORKER") => void;
  setToolKey: Dispatch<SetStateAction<BridgeToolKey | undefined>>;
  showTopNotice: (message: string, duration?: number) => void;
}) {
  const picker = usePhotoFolderPicker();
  const desktopWindowMode = useDesktopWindowMode();
  const { navigate } = useDesktopWindowRoute();
  const [folderSourceOpen, setFolderSourceOpen] = useState(false);
  const [nasPickerOpen, setNasPickerOpen] = useState(false);
  const [rawRootPromptOpen, setRawRootPromptOpen] = useState(false);
  const [rawRootPromptError, setRawRootPromptError] = useState("");
  const rawMatchOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (rawMatchOpenTimerRef.current) clearTimeout(rawMatchOpenTimerRef.current);
  }, []);

  const changeNestedJpgVisibility = useCallback((checked: boolean) => {
    setIncludeNestedJpgs(checked);
    if (!activeFolder || !breadcrumbs.length) return;
    void loadDirectory(activeFolder, breadcrumbs, checked);
  }, [activeFolder, breadcrumbs, loadDirectory, setIncludeNestedJpgs]);

  const chooseFolder = useCallback(async () => {
    const directory = await picker.pick("readwrite");
    if (!directory) return;
    if (!desktopWindowMode) {
      navigate?.("/olivia-bridge", "Olivia Bridge", {
        clientId,
        projectId: workflowRunId,
        workflowRunId,
      });
    }
    await loadDirectory(directory, [{ name: directory.name, handle: directory }]);
  }, [clientId, desktopWindowMode, loadDirectory, navigate, picker, workflowRunId]);

  const openFolderSourceChooser = useCallback(() => setFolderSourceOpen(true), []);
  const closeFolderSourceChooser = useCallback(() => setFolderSourceOpen(false), []);
  const pickLocalFolder = useCallback(() => {
    setFolderSourceOpen(false);
    void chooseFolder();
  }, [chooseFolder]);
  const pickNasFolder = useCallback(() => {
    setFolderSourceOpen(false);
    setNasPickerOpen(true);
  }, []);

  const pickRawSearchRoot = useCallback(async () => {
    if (!activeFolder) return;
    const root = await picker.pick("readwrite", { startIn: activeFolder });
    if (!root) return;
    try {
      const trail = await resolveBridgeFolderTrail(root, activeFolder);
      if (!trail) {
        setRawRootPromptError(`고른 폴더 안에서 지금 열린 폴더(${activeFolderName || activeFolder.name})를 찾지 못했습니다.\n지금 폴더를 담고 있는 촬영 폴더를 골라 주세요. 같은 폴더라도 NAS 동기화 경로와 SSD 경로는 다른 폴더로 봅니다.`);
        return;
      }
      setBreadcrumbs(trail);
      setRawMatchFolderPath(trail.map((item) => item.name).join(" / "));
      setRawMatchDefaultFolder(bridgeRawMatchDefaultFolder(trail));
      setRawMatchFolderCandidates(bridgeRawMatchFolderCandidates(trail));
      setRawRootPromptOpen(false);
      setRawRootPromptError("");
      showTopNotice(`RAW 검색 범위: ${root.name}부터`);
      if (rawMatchOpenTimerRef.current) clearTimeout(rawMatchOpenTimerRef.current);
      rawMatchOpenTimerRef.current = setTimeout(() => {
        setToolKey("raw-match");
        rawMatchOpenTimerRef.current = null;
      }, 3_000);
      void saveBridgeFolderTrail(trail).catch((error) => {
        console.error("[olivia-bridge] Failed to remember the RAW search root", error);
      });
    } catch (error) {
      setRawRootPromptError(error instanceof Error ? error.message : "촬영 상위 폴더를 확인하지 못했습니다.");
    }
  }, [activeFolder, activeFolderName, picker, setBreadcrumbs, setRawMatchDefaultFolder, setRawMatchFolderCandidates, setRawMatchFolderPath, setToolKey, showTopNotice]);

  const openRawRootPrompt = useCallback(() => {
    setRawRootPromptError("");
    setRawRootPromptOpen(true);
  }, []);
  const closeRawRootPrompt = useCallback(() => {
    setRawRootPromptOpen(false);
    setRawRootPromptError("");
  }, []);
  const openRawMatchWithCurrentScope = useCallback(() => {
    setRawRootPromptOpen(false);
    setRawRootPromptError("");
    setToolKey("raw-match");
  }, [setToolKey]);

  const cancelNasPicker = useCallback(() => {
    setNasPickerOpen(false);
    rootRef.current?.focus();
  }, [rootRef]);
  const selectNasFolder = useCallback((selection: RemoteNasSelection) => {
    setNasPickerOpen(false);
    setExecutionMode("REMOTE_WORKER");
    void loadRemoteDirectory(selection);
  }, [loadRemoteDirectory, setExecutionMode]);

  const closeFolderDialogs = useCallback(() => {
    setFolderSourceOpen(false);
    setNasPickerOpen(false);
    setRawRootPromptOpen(false);
    setRawRootPromptError("");
  }, []);

  return {
    folderSourceOpen,
    nasPickerOpen,
    rawRootPromptOpen,
    rawRootPromptError,
    changeNestedJpgVisibility,
    openFolderSourceChooser,
    closeFolderSourceChooser,
    pickLocalFolder,
    pickNasFolder,
    pickRawSearchRoot,
    openRawRootPrompt,
    closeRawRootPrompt,
    openRawMatchWithCurrentScope,
    cancelNasPicker,
    selectNasFolder,
    closeFolderDialogs,
  };
}
