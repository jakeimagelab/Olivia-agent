"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkRemotePhotoWorkFolder,
  type RemotePhotoWorkFolderCheck,
} from "@/lib/photo-classifier/remotePhotoWorkFolderCheck";

export type RemoteWorkFolderCheckState =
  | { status: "idle" }
  | { status: "checking"; sourceFolder: string }
  | { status: "available"; result: RemotePhotoWorkFolderCheck }
  | { status: "resume"; result: RemotePhotoWorkFolderCheck }
  | { status: "error"; sourceFolder: string; message: string };

export function remoteWorkFolderStateFromResult(
  result: RemotePhotoWorkFolderCheck,
): RemoteWorkFolderCheckState {
  return result.jpgWorkFolderExists
    ? { status: "resume", result }
    : { status: "available", result };
}

export function isRemoteWorkFolderReady(
  state: RemoteWorkFolderCheckState,
  sourceFolder: string | null | undefined,
) {
  return (state.status === "available" || state.status === "resume")
    && state.result.sourceFolder === sourceFolder;
}

export function useRemoteWorkFolderCheck({
  enabled,
  sourceFolder,
}: {
  enabled: boolean;
  sourceFolder: string | null | undefined;
}) {
  const [state, setState] = useState<RemoteWorkFolderCheckState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const check = useCallback(async (folder: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "checking", sourceFolder: folder });

    try {
      const result = await checkRemotePhotoWorkFolder(folder, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setState(remoteWorkFolderStateFromResult(result));
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({
        status: "error",
        sourceFolder: folder,
        message: error instanceof Error ? error.message : "Agentstation 작업본을 확인하지 못했습니다.",
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !sourceFolder) {
      abortRef.current?.abort();
      abortRef.current = null;
      setState({ status: "idle" });
      return;
    }
    void check(sourceFolder);
  }, [check, enabled, sourceFolder]);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const ready = useMemo(
    () => isRemoteWorkFolderReady(state, sourceFolder),
    [sourceFolder, state],
  );

  return {
    state,
    ready,
    check,
  };
}
