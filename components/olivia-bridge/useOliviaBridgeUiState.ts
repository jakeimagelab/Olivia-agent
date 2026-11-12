"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { OliviaBridgePreviewTab } from "@/components/olivia-bridge/OliviaBridgePreviewPanel";
import type { BridgeFloatingWindowRect } from "@/lib/photo-bridge/floatingWindow";

export function useOliviaBridgeUiState({
  rootRef,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const [topNotice, setTopNotice] = useState("");
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>();
  const [fullscreenPreviewOpen, setFullscreenPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<OliviaBridgePreviewTab>("selection");
  const [compactPreviewOpen, setCompactPreviewOpen] = useState(false);
  const floatingWindowRectsRef = useRef<Record<string, BridgeFloatingWindowRect>>({});
  const topNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTopNotice = useCallback((message: string, duration = 3_000) => {
    if (topNoticeTimerRef.current) clearTimeout(topNoticeTimerRef.current);
    setTopNotice(message);
    topNoticeTimerRef.current = setTimeout(() => {
      setTopNotice("");
      topNoticeTimerRef.current = null;
    }, duration);
  }, []);
  const showAdobeSelectionNotice = useCallback(() => {
    showTopNotice("어도비 기준입니다. 별점은 어도비 브릿지에서 바꿔 주세요.");
  }, [showTopNotice]);

  useEffect(() => () => {
    if (topNoticeTimerRef.current) clearTimeout(topNoticeTimerRef.current);
  }, []);

  const closeFullscreenPreview = useCallback(() => {
    setFullscreenPreviewOpen(false);
    requestAnimationFrame(() => rootRef.current?.focus());
  }, [rootRef]);
  const closeCompactPreview = useCallback(() => setCompactPreviewOpen(false), []);
  const openCompactPreview = useCallback(() => setCompactPreviewOpen(true), []);
  const openOliviaPreview = useCallback(() => {
    setPreviewTab("olivia");
    setCompactPreviewOpen(true);
  }, []);
  const openSelectionPreview = useCallback(() => {
    setPreviewTab("selection");
    setCompactPreviewOpen(true);
  }, []);
  const updateFloatingWindowRect = useCallback((windowId: string, rect: BridgeFloatingWindowRect) => {
    floatingWindowRectsRef.current[windowId] = rect;
  }, []);

  useEffect(() => {
    const openInspector = () => openSelectionPreview();
    window.addEventListener("olivia-bridge-open-inspector", openInspector);
    return () => window.removeEventListener("olivia-bridge-open-inspector", openInspector);
  }, [openSelectionPreview]);

  return {
    topNotice,
    showTopNotice,
    showAdobeSelectionNotice,
    previewSize,
    setPreviewSize,
    fullscreenPreviewOpen,
    setFullscreenPreviewOpen,
    closeFullscreenPreview,
    previewTab,
    setPreviewTab,
    compactPreviewOpen,
    openCompactPreview,
    closeCompactPreview,
    openOliviaPreview,
    openSelectionPreview,
    floatingWindowRectsRef,
    updateFloatingWindowRect,
  };
}
