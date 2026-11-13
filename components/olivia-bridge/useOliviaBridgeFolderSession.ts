"use client";

import { useMemo, useState } from "react";

import type { BridgeFolderScan } from "@/lib/photo-bridge/bridgeFiles";
import type { BridgeFolderTrailItem } from "@/lib/photo-bridge/recentFolder";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";

export type OliviaBridgeScanStatus = "idle" | "restoring" | "loading" | "ready" | "error";

const EMPTY_SCAN: BridgeFolderScan = {
  folders: [],
  jpgs: [],
  raws: [],
  sidecars: [],
  ignoredCount: 0,
  nestedJpgCount: 0,
  unreadableFolderCount: 0,
};

export function resolveOliviaBridgeRemoteProjectSelection(
  remoteFolder: RemoteNasSelection | null,
) {
  if (!remoteFolder) return undefined;
  const pathParts = remoteFolder.path.split("/").filter(Boolean);
  const displayParts = remoteFolder.displayPath.split("/").filter(Boolean);
  if (pathParts.at(-1)?.normalize("NFC") === JPG_INTEGRATED_DIRECTORY) pathParts.pop();
  if (displayParts.at(-1)?.normalize("NFC") === JPG_INTEGRATED_DIRECTORY) displayParts.pop();
  return {
    ...remoteFolder,
    path: pathParts.join("/"),
    displayPath: displayParts.join("/"),
  };
}

export function useOliviaBridgeFolderSession() {
  const [breadcrumbs, setBreadcrumbs] = useState<BridgeFolderTrailItem[]>([]);
  const [remoteFolder, setRemoteFolder] = useState<RemoteNasSelection | null>(null);
  const [scan, setScan] = useState<BridgeFolderScan>(EMPTY_SCAN);
  const [scanStatus, setScanStatus] = useState<OliviaBridgeScanStatus>("restoring");
  const [remoteLoadProgress, setRemoteLoadProgress] = useState<{
    received: number;
    total: number;
  } | null>(null);
  const [, setScanError] = useState<string>();
  const [includeNestedJpgs, setIncludeNestedJpgs] = useState(false);
  const [restoreTrail, setRestoreTrail] = useState<BridgeFolderTrailItem[]>([]);
  const [restoreMessage, setRestoreMessage] = useState("");

  const activeFolder = breadcrumbs.at(-1)?.handle ?? null;
  const folderPath = remoteFolder?.path ?? breadcrumbs.map((item) => item.name).join(" / ");
  const folderSelectionSourceKey = remoteFolder?.path
    ?? breadcrumbs.map((item) => item.name).join("/");
  const activeFolderName = activeFolder?.name
    ?? remoteFolder?.displayPath.split("/").filter(Boolean).at(-1)
    ?? "";
  const hasActiveFolder = Boolean(activeFolder || remoteFolder);
  const remoteProjectSelection = useMemo(
    () => resolveOliviaBridgeRemoteProjectSelection(remoteFolder),
    [remoteFolder],
  );

  return {
    breadcrumbs,
    setBreadcrumbs,
    remoteFolder,
    setRemoteFolder,
    scan,
    setScan,
    scanStatus,
    setScanStatus,
    remoteLoadProgress,
    setRemoteLoadProgress,
    setScanError,
    includeNestedJpgs,
    setIncludeNestedJpgs,
    restoreTrail,
    setRestoreTrail,
    restoreMessage,
    setRestoreMessage,
    activeFolder,
    folderPath,
    folderSelectionSourceKey,
    activeFolderName,
    hasActiveFolder,
    remoteProjectSelection,
  };
}
