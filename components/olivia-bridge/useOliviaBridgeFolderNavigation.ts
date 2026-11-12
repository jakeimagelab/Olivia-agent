"use client";

import { useCallback } from "react";

import type { BridgeFolderTrailItem } from "@/lib/photo-bridge/recentFolder";

type LoadDirectory = (
  directory: FileSystemDirectoryHandle,
  trail: BridgeFolderTrailItem[],
) => Promise<void>;

export function useOliviaBridgeFolderNavigation({
  breadcrumbs,
  loadDirectory,
  restoreLastFolder,
}: {
  breadcrumbs: BridgeFolderTrailItem[];
  loadDirectory: LoadDirectory;
  restoreLastFolder: () => Promise<void>;
}) {
  const openRootFolder = useCallback(() => {
    const root = breadcrumbs[0];
    if (root) void loadDirectory(root.handle, breadcrumbs.slice(0, 1));
  }, [breadcrumbs, loadDirectory]);

  const openChildFolder = useCallback((folder: FileSystemDirectoryHandle) => {
    void loadDirectory(folder, [...breadcrumbs, { name: folder.name, handle: folder }]);
  }, [breadcrumbs, loadDirectory]);

  const openBreadcrumb = useCallback((index: number) => {
    const item = breadcrumbs[index];
    if (item) void loadDirectory(item.handle, breadcrumbs.slice(0, index + 1));
  }, [breadcrumbs, loadDirectory]);

  const restoreBrowserFolder = useCallback(() => {
    void restoreLastFolder();
  }, [restoreLastFolder]);

  return {
    openRootFolder,
    openChildFolder,
    openBreadcrumb,
    restoreBrowserFolder,
  };
}
