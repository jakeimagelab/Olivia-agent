"use client";

import { useEffect, useMemo, useState } from "react";

function line(values: number[], height: number) {
  const max = Math.max(1, ...values);
  return values.map((value, index) => `${index ? "L" : "M"}${(index / (values.length - 1)) * 100},${height - value / max * height}`).join(" ");
}

export function ColorHistogram({ sourceUrl }: { sourceUrl: string | null }) {
  const [channels, setChannels] = useState<number[][]>([[], [], []]);
  useEffect(() => {
    if (!sourceUrl) return;
    let stopped = false;
    void (async () => {
      try {
        const response = await fetch(sourceUrl);
        const bitmap = await createImageBitmap(await response.blob());
        const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const bins = [new Array(64).fill(0), new Array(64).fill(0), new Array(64).fill(0)] as number[][];
        for (let index = 0; index < pixels.length; index += 16) {
          bins[0][Math.min(63, pixels[index] >> 2)] += 1;
          bins[1][Math.min(63, pixels[index + 1] >> 2)] += 1;
          bins[2][Math.min(63, pixels[index + 2] >> 2)] += 1;
        }
        if (!stopped) setChannels(bins);
      } catch { if (!stopped) setChannels([[], [], []]); }
    })();
    return () => { stopped = true; };
  }, [sourceUrl]);
  const paths = useMemo(() => channels.map((channel) => line(channel.length ? channel : [0, 0], 42)), [channels]);
  return <svg viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="RGB 히스토그램">
    <path d={paths[0]} stroke="#ff6868" /><path d={paths[1]} stroke="#53d89b" /><path d={paths[2]} stroke="#6b91ff" />
  </svg>;
}
