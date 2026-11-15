"use client";

import { useEffect, useRef, useState } from "react";

import type { PhotoEditRecipe, PhotoMeasurement } from "@/lib/photo-edit";

type WorkerReply = {
  id: number;
  ok: boolean;
  data?: ArrayBuffer;
  width?: number;
  height?: number;
  measurementAfter?: PhotoMeasurement;
  error?: string;
};

async function decodePreview(url: string, maxEdge: number) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("원본 미리보기를 읽지 못했습니다.");
  const bitmap = await createImageBitmap(await response.blob());
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("미리보기 캔버스를 열지 못했습니다.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const rgba = context.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target++] = rgba[source]; rgb[target++] = rgba[source + 1]; rgb[target++] = rgba[source + 2];
  }
  return { rgb, width, height };
}

function toObjectUrl(data: ArrayBuffer, width: number, height: number): Promise<string> {
  const rgb = new Uint8Array(data);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let source = 0, target = 0; source < rgb.length; source += 3) {
    rgba[target++] = rgb[source]; rgba[target++] = rgb[source + 1]; rgba[target++] = rgb[source + 2]; rgba[target++] = 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("미리보기 캔버스를 열지 못했습니다."));
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("미리보기를 만들지 못했습니다.")), "image/jpeg", 0.94));
}

export function usePhotoEditPreview({ sourceUrl, recipe, showSkinMask, dragging }: {
  sourceUrl: string | null;
  recipe: PhotoEditRecipe;
  showSkinMask: boolean;
  dragging: boolean;
}) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [measurementAfter, setMeasurementAfter] = useState<PhotoMeasurement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const worker = new Worker(new URL("./photoEditPreview.worker.ts", import.meta.url));
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sourceUrl || !workerRef.current) return;
    let stopped = false;
    let onMessage: ((event: MessageEvent<WorkerReply>) => void) | null = null;
    const worker = workerRef.current;
    const id = ++requestIdRef.current;
    setBusy(true);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const decoded = await decodePreview(sourceUrl, dragging ? 1_000 : 2_000);
        if (stopped || id !== requestIdRef.current) return;
        onMessage = async (event: MessageEvent<WorkerReply>) => {
          if (event.data.id !== id) return;
          if (onMessage) worker.removeEventListener("message", onMessage);
          onMessage = null;
          if (stopped) return;
          if (!event.data.ok || !event.data.data || !event.data.width || !event.data.height) {
            setError(event.data.error || "미리보기를 만들지 못했습니다."); setBusy(false); return;
          }
          const url = await toObjectUrl(event.data.data, event.data.width, event.data.height);
          if (stopped || id !== requestIdRef.current) { URL.revokeObjectURL(url); return; }
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = url;
          setPreviewUrl(url);
          setMeasurementAfter(event.data.measurementAfter ?? null);
          setBusy(false);
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ id, data: decoded.rgb.buffer, width: decoded.width, height: decoded.height, recipe, showSkinMask }, [decoded.rgb.buffer]);
      } catch (cause) {
        if (!stopped) { setError(cause instanceof Error ? cause.message : "미리보기를 만들지 못했습니다."); setBusy(false); }
      }
    }, dragging ? 40 : 120);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (onMessage) worker.removeEventListener("message", onMessage);
      onMessage = null;
    };
  }, [dragging, recipe, showSkinMask, sourceUrl]);

  return { previewUrl, measurementAfter, busy, error };
}
