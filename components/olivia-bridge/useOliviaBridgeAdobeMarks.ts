"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import type { BridgeFolderScan } from "@/lib/photo-bridge/bridgeFiles";
import {
  projectAdobeBridgeMarks,
  type AdobeBridgeMarkProjection,
} from "@/lib/photo-bridge/adobeMarkProjection";
import { loadRemoteBridgeRatings } from "@/lib/photo-bridge/remoteRatings";
import type { BridgeColorLabels } from "@/lib/photo-bridge/labels";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { collectAdobeBridgeMarks, type AdobeBridgeMark } from "@/lib/selectMatch/bridgeRating";

export type OliviaBridgeAdobeMarkStatus = {
  read: number;
  total: number;
  rated: number;
  colored: number;
  failed: number;
  failedFileNames: string[];
  firstError: string | null;
};

const EMPTY_ADOBE_MARK_STATUS: OliviaBridgeAdobeMarkStatus = {
  read: 0,
  total: 0,
  rated: 0,
  colored: 0,
  failed: 0,
  failedFileNames: [],
  firstError: null,
};

type UseOliviaBridgeAdobeMarksOptions = {
  activeFolder: FileSystemDirectoryHandle | null;
  remoteFolder: RemoteNasSelection | null;
  scan: Pick<BridgeFolderScan, "jpgs" | "raws">;
  scanStatus: "idle" | "restoring" | "loading" | "ready" | "error";
  selectionSource: BridgeSelectionSource;
  selectionSourceRef: RefObject<BridgeSelectionSource>;
  manualSelectedIdsRef: RefObject<Set<string>>;
  commitSelectedIds: (manual: ReadonlySet<string>, adobe: ReadonlySet<string>) => void;
  publishRatingsForSource: (source: BridgeSelectionSource, adobeRatings: Record<string, number>) => void;
};

export function useOliviaBridgeAdobeMarks({
  activeFolder,
  remoteFolder,
  scan,
  scanStatus,
  selectionSource,
  selectionSourceRef,
  manualSelectedIdsRef,
  commitSelectedIds,
  publishRatingsForSource,
}: UseOliviaBridgeAdobeMarksOptions) {
  const generationRef = useRef(0);
  const [adobeRatings, setAdobeRatings] = useState<Record<string, number>>({});
  const [adobeColorLabels, setAdobeColorLabels] = useState<BridgeColorLabels>({});
  const [rawAdobeMarks, setRawAdobeMarks] = useState<Record<string, AdobeBridgeMark>>({});
  const [adobeSelectionLoading, setAdobeSelectionLoading] = useState(false);
  const [adobeMarkStatus, setAdobeMarkStatus] = useState<OliviaBridgeAdobeMarkStatus>(EMPTY_ADOBE_MARK_STATUS);

  const resetAdobeMarks = useCallback(() => {
    generationRef.current += 1;
    setAdobeRatings({});
    setAdobeColorLabels({});
    setRawAdobeMarks({});
    setAdobeSelectionLoading(false);
    setAdobeMarkStatus(EMPTY_ADOBE_MARK_STATUS);
  }, []);

  const applyProjection = useCallback((
    projection: AdobeBridgeMarkProjection,
    status: OliviaBridgeAdobeMarkStatus,
  ) => {
    setAdobeRatings(projection.ratings);
    setAdobeColorLabels(projection.colorLabels);
    setRawAdobeMarks(projection.rawMarks);
    setAdobeMarkStatus(status);
    publishRatingsForSource(selectionSourceRef.current, projection.ratings);
    commitSelectedIds(manualSelectedIdsRef.current, projection.selectedIds);
  }, [commitSelectedIds, manualSelectedIdsRef, publishRatingsForSource, selectionSourceRef]);

  const syncAdobeBridgeSelection = useCallback(async (signal?: AbortSignal) => {
    const generation = ++generationRef.current;
    if (selectionSourceRef.current === "olivia") {
      setAdobeSelectionLoading(false);
      return;
    }

    if ((!scan.jpgs.length && !scan.raws.length) || (!activeFolder && !remoteFolder)) {
      resetAdobeMarks();
      commitSelectedIds(manualSelectedIdsRef.current, new Set());
      return;
    }

    setAdobeSelectionLoading(true);

    if (!activeFolder && remoteFolder) {
      try {
        const remote = await loadRemoteBridgeRatings(remoteFolder.path, { signal });
        if (signal?.aborted || generation !== generationRef.current) return;
        const byKey = new Map(remote.ratings.map((item) => [item.key, item]));
        const projected = projectAdobeBridgeMarks(scan.jpgs, scan.raws, byKey);
        applyProjection(projected, {
          read: remote.scanned,
          total: remote.scanned,
          rated: remote.ratings.filter((mark) => mark.rating !== null).length,
          colored: remote.ratings.filter((mark) => mark.colorLabel !== null).length,
          failed: 0,
          failedFileNames: [],
          firstError: null,
        });
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        console.error("[olivia-bridge] Failed to sync remote Adobe Bridge ratings", error);
        setAdobeMarkStatus((current) => ({
          ...current,
          failed: Math.max(1, current.failed),
          firstError: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        if (generation === generationRef.current) setAdobeSelectionLoading(false);
      }
      return;
    }

    try {
      const localPhotos = [...scan.jpgs, ...scan.raws]
        .filter((photo) => Boolean(photo.handle || ("file" in photo && photo.file)))
        .map((photo) => ({
          name: photo.name,
          file: ("file" in photo ? photo.file : undefined) as File | undefined,
          handle: photo.handle,
          parentHandle: photo.parentHandle,
          relativeDirectory: photo.relativeDirectory,
        }));
      setAdobeMarkStatus({ ...EMPTY_ADOBE_MARK_STATUS, total: localPhotos.length });
      const found = await collectAdobeBridgeMarks(activeFolder!, localPhotos, {
        signal,
        onProgress: (progress) => {
          if (generation !== generationRef.current) return;
          setAdobeMarkStatus((current) => ({ ...current, ...progress }));
        },
      });
      if (signal?.aborted || generation !== generationRef.current) return;
      const projected = projectAdobeBridgeMarks(scan.jpgs, scan.raws, found.marks);
      applyProjection(projected, {
        read: found.read,
        total: found.total,
        rated: found.rated,
        colored: found.colored,
        failed: found.failed,
        failedFileNames: found.failedFileNames,
        firstError: found.firstError,
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      console.error("[olivia-bridge] Failed to sync Adobe Bridge ratings", error);
      setAdobeMarkStatus((current) => ({
        ...current,
        failed: Math.max(1, current.failed),
        firstError: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      if (generation === generationRef.current) setAdobeSelectionLoading(false);
    }
  }, [activeFolder, applyProjection, commitSelectedIds, manualSelectedIdsRef, remoteFolder, resetAdobeMarks, scan.jpgs, scan.raws, selectionSourceRef]);

  useEffect(() => {
    if (scanStatus !== "ready" || selectionSource === "olivia") return;
    const controller = new AbortController();
    void syncAdobeBridgeSelection(controller.signal);
    return () => controller.abort();
  }, [scanStatus, selectionSource, syncAdobeBridgeSelection]);

  useEffect(() => {
    if (scanStatus !== "ready" || selectionSource === "olivia") return;
    const refresh = () => { void syncAdobeBridgeSelection(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [scanStatus, selectionSource, syncAdobeBridgeSelection]);

  return {
    adobeRatings,
    adobeColorLabels,
    rawAdobeMarks,
    adobeSelectionLoading,
    adobeMarkStatus,
    resetAdobeMarks,
    syncAdobeBridgeSelection,
  };
}
