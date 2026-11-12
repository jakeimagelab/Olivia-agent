"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { loadBrowserThumbnail, releaseObjectUrl } from "@/lib/selectMatch/browserThumbnail";
import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";

export function useSelectMatchSceneThumbnails({
  rootDir,
  scenes,
  setScenes,
  searchActive,
  visibleScenes,
}: {
  rootDir: FileSystemDirectoryHandle | null;
  scenes: SelectMatchFolderGroup[];
  setScenes: Dispatch<SetStateAction<SelectMatchFolderGroup[]>>;
  searchActive: boolean;
  visibleScenes: readonly SelectMatchFolderGroup[];
}) {
  const thumbnailUrlsRef = useRef(new Set<string>());
  const searchRequestsRef = useRef(new WeakSet<FileSystemDirectoryHandle>());

  const releaseSceneThumbnails = useCallback(() => {
    for (const url of thumbnailUrlsRef.current) releaseObjectUrl(url);
    thumbnailUrlsRef.current.clear();
  }, []);

  const resetSceneThumbnails = useCallback(() => {
    releaseSceneThumbnails();
    searchRequestsRef.current = new WeakSet<FileSystemDirectoryHandle>();
  }, [releaseSceneThumbnails]);

  useEffect(() => () => releaseSceneThumbnails(), [releaseSceneThumbnails, rootDir]);

  const loadSceneThumbs = useCallback(async (sceneIndex: number) => {
    const scene = scenes[sceneIndex];
    if (!scene) return;
    const updated = [] as typeof scene.photos;
    for (const [index, photo] of scene.photos.entries()) {
      if (photo.thumbUrl) {
        updated.push(photo);
      } else {
        try {
          const file = await photo.handle.getFile();
          const url = await loadBrowserThumbnail(file, 130);
          if (url) thumbnailUrlsRef.current.add(url);
          updated.push({ ...photo, thumbUrl: url });
        } catch {
          updated.push(photo);
        }
      }
      if ((index + 1) % 20 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    setScenes((current) => current.map((item, index) => (
      index === sceneIndex ? { ...item, photos: updated } : item
    )));
  }, [scenes, setScenes]);

  useEffect(() => {
    if (!searchActive) return;
    for (const scene of visibleScenes) {
      if (searchRequestsRef.current.has(scene.dirHandle)) continue;
      const sceneIndex = scenes.findIndex((candidate) => candidate.dirHandle === scene.dirHandle);
      if (sceneIndex < 0) continue;
      searchRequestsRef.current.add(scene.dirHandle);
      void loadSceneThumbs(sceneIndex);
    }
  }, [loadSceneThumbs, scenes, searchActive, visibleScenes]);

  return {
    thumbnailUrlsRef,
    resetSceneThumbnails,
    loadSceneThumbs,
  };
}
