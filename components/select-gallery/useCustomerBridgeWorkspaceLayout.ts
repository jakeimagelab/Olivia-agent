"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const FOLDER_WIDTH_MIN = 160;
const FOLDER_WIDTH_MAX = 340;
const PREVIEW_WIDTH_MIN = 250;
const PREVIEW_WIDTH_MAX = 520;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function useCustomerBridgeWorkspaceLayout() {
  const [folderWidth, setFolderWidth] = useState(210);
  const [previewWidth, setPreviewWidth] = useState(320);
  const [compactFoldersOpen, setCompactFoldersOpen] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px), (pointer: coarse)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const closeCompactFolders = useCallback(() => setCompactFoldersOpen(false), []);
  const beginResize = useCallback((pane: "folder" | "preview", event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const start = pane === "folder" ? folderWidth : previewWidth;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (pane === "folder") setFolderWidth(clamp(start + delta, FOLDER_WIDTH_MIN, FOLDER_WIDTH_MAX));
      else setPreviewWidth(clamp(start - delta, PREVIEW_WIDTH_MIN, PREVIEW_WIDTH_MAX));
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  }, [folderWidth, previewWidth]);
  const workspaceStyle = useMemo(() => ({
    "--bridge-folder-width": `${folderWidth}px`,
    "--bridge-preview-width": `${previewWidth}px`,
  }) as CSSProperties, [folderWidth, previewWidth]);

  return {
    compactFoldersOpen,
    setCompactFoldersOpen,
    mobile,
    closeCompactFolders,
    beginResize,
    workspaceStyle,
  };
}
