"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { OliviaBridgeCaptureMetadataState } from "@/components/olivia-bridge/OliviaBridgeBrowserPanel";
import {
  readBridgeCaptureMetadata,
  type BridgeFolderScan,
  type BridgeJpgSortMode,
} from "@/lib/photo-bridge/bridgeFiles";

type UseOliviaBridgeCaptureMetadataOptions = {
  jpgSortMode: BridgeJpgSortMode;
  scanStatus: "idle" | "restoring" | "loading" | "ready" | "error";
  scan: BridgeFolderScan;
  setScan: Dispatch<SetStateAction<BridgeFolderScan>>;
};

export function useOliviaBridgeCaptureMetadata({
  jpgSortMode,
  scanStatus,
  scan,
  setScan,
}: UseOliviaBridgeCaptureMetadataOptions) {
  const generationRef = useRef(0);
  const [state, setState] = useState<OliviaBridgeCaptureMetadataState>({
    status: "idle",
    completed: 0,
    total: 0,
    fallbackCount: 0,
  });

  useEffect(() => {
    const generation = ++generationRef.current;
    if (jpgSortMode !== "capture" || scanStatus !== "ready" || !scan.jpgs.length) {
      setState({ status: "idle", completed: 0, total: scan.jpgs.length, fallbackCount: 0 });
      return;
    }

    const ready = scan.jpgs.every((photo) => photo.captureTimestamp !== undefined && photo.timestampSource);
    if (ready) {
      setState({
        status: "ready",
        completed: scan.jpgs.length,
        total: scan.jpgs.length,
        fallbackCount: scan.jpgs.filter((photo) => photo.timestampSource === "mtime").length,
      });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", completed: 0, total: scan.jpgs.length, fallbackCount: 0 });
    void readBridgeCaptureMetadata(scan.jpgs, {
      signal: controller.signal,
      onProgress: (completed, total) => {
        if (generation !== generationRef.current) return;
        setState((current) => ({ ...current, status: "loading", completed, total }));
      },
    }).then((jpgs) => {
      if (generation !== generationRef.current) return;
      setScan((current) => {
        if (current.jpgs.length !== scan.jpgs.length || current.jpgs.some((photo, index) => photo.id !== scan.jpgs[index]?.id)) return current;
        return { ...current, jpgs };
      });
      setState({
        status: "ready",
        completed: jpgs.length,
        total: jpgs.length,
        fallbackCount: jpgs.filter((photo) => photo.timestampSource === "mtime").length,
      });
    }).catch((error) => {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      console.error("[olivia-bridge] Failed to read capture metadata", error);
      setState({ status: "error", completed: 0, total: scan.jpgs.length, fallbackCount: 0 });
    });

    return () => controller.abort();
  }, [jpgSortMode, scan.jpgs, scanStatus, setScan]);

  return state;
}
