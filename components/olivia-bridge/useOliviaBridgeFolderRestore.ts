"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  clearBridgeFolderTrail,
  queryBridgeFolderTrailPermission,
  readBridgeFolderTrail,
  requestBridgeFolderTrailPermission,
  type BridgeFolderTrailItem,
} from "@/lib/photo-bridge/recentFolder";
import { normalizeRemoteNasRelativePath, toRemoteNasDisplayPath } from "@/lib/remote-nas/path";
import { REMOTE_NAS_ROOT_NAME, type RemoteNasSelection } from "@/lib/remote-nas/types";

type ScanStatus = "idle" | "restoring" | "loading" | "ready" | "error";

type UseOliviaBridgeFolderRestoreOptions = {
  remoteFolderQuery: string | null;
  restoreTrail: BridgeFolderTrailItem[];
  setRestoreTrail: Dispatch<SetStateAction<BridgeFolderTrailItem[]>>;
  setRestoreMessage: Dispatch<SetStateAction<string>>;
  setScanStatus: Dispatch<SetStateAction<ScanStatus>>;
  setExecutionMode: (mode: "REMOTE_WORKER") => void;
  loadDirectory: (directory: FileSystemDirectoryHandle, trail: BridgeFolderTrailItem[]) => Promise<void>;
  loadRemoteDirectory: (selection: RemoteNasSelection) => Promise<void>;
};

export function useOliviaBridgeFolderRestore({
  remoteFolderQuery,
  restoreTrail,
  setRestoreTrail,
  setRestoreMessage,
  setScanStatus,
  setExecutionMode,
  loadDirectory,
  loadRemoteDirectory,
}: UseOliviaBridgeFolderRestoreOptions) {
  const restoreAttemptedRef = useRef(false);
  const remoteFolderPrefillApplied = useRef<string | null>(null);

  useEffect(() => {
    if (!remoteFolderQuery || remoteFolderPrefillApplied.current === remoteFolderQuery) return;
    remoteFolderPrefillApplied.current = remoteFolderQuery;
    try {
      const path = normalizeRemoteNasRelativePath(remoteFolderQuery);
      if (!path) return;
      restoreAttemptedRef.current = true;
      setExecutionMode("REMOTE_WORKER");
      void loadRemoteDirectory({
        path,
        displayPath: toRemoteNasDisplayPath(path),
        rootName: REMOTE_NAS_ROOT_NAME,
      });
    } catch {
      // 잘못된 경로면 사용자가 직접 폴더를 고를 수 있도록 초기 화면을 유지한다.
    }
  }, [loadRemoteDirectory, remoteFolderQuery, setExecutionMode]);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    let disposed = false;

    void readBridgeFolderTrail().then(async (trail) => {
      if (disposed) return;
      if (!trail?.length) {
        setScanStatus("idle");
        return;
      }
      const permission = await queryBridgeFolderTrailPermission(trail);
      if (disposed) return;
      if (permission === "granted") {
        await loadDirectory(trail.at(-1)!.handle, trail);
        return;
      }
      setRestoreTrail(trail);
      setRestoreMessage(permission === "denied"
        ? `${trail.at(-1)?.name ?? "지난 폴더"} 접근 권한이 해제되었습니다. 다시 허용하면 이어서 열 수 있습니다.`
        : `${trail.at(-1)?.name ?? "지난 폴더"} 접근 권한을 다시 확인해 주세요.`);
      setScanStatus("idle");
    }).catch(async (error) => {
      console.error("[olivia-bridge] Failed to restore the last folder", error);
      await clearBridgeFolderTrail().catch(() => undefined);
      if (disposed) return;
      setRestoreMessage("지난 폴더를 다시 열지 못했습니다. 새 폴더를 선택해 주세요.");
      setScanStatus("idle");
    });

    return () => { disposed = true; };
  }, [loadDirectory, setRestoreMessage, setRestoreTrail, setScanStatus]);

  return useCallback(async () => {
    if (!restoreTrail.length) return;
    setRestoreMessage("");
    try {
      const permission = await requestBridgeFolderTrailPermission(restoreTrail);
      if (permission !== "granted") {
        setRestoreMessage("지난 폴더의 접근 권한을 허용하지 않았습니다. 다른 폴더를 선택할 수 있습니다.");
        return;
      }
      await loadDirectory(restoreTrail.at(-1)!.handle, restoreTrail);
    } catch (error) {
      console.error("[olivia-bridge] Failed to request the last folder permission", error);
      setRestoreMessage("지난 폴더를 다시 열지 못했습니다. 다른 폴더를 선택해 주세요.");
    }
  }, [loadDirectory, restoreTrail, setRestoreMessage]);
}
