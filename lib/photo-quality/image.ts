import { createHash } from "node:crypto";
import sharp from "sharp";
import type { PhotoQualityLocalMetrics } from "./types";

export async function preparePhotoQualityPreview(buffer: Buffer) {
  const preview = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 76, mozjpeg: true })
    .toBuffer();
  return {
    fingerprint: createHash("sha256").update(buffer).digest("hex"),
    dataUrl: `data:image/jpeg;base64,${preview.toString("base64")}`,
    preview,
  };
}
export async function analyzePhotoQualityLocally(buffer: Buffer): Promise<PhotoQualityLocalMetrics> {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 280, height: 280, fit: "inside", withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let brightnessTotal = 0;
  for (const value of data) brightnessTotal += value;
  let laplacianTotal = 0;
  let count = 0;
  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const center = y * info.width + x;
      const laplacian = data[center] * 4 - data[center - info.width] - data[center + info.width] - data[center - 1] - data[center + 1];
      laplacianTotal += laplacian * laplacian;
      count += 1;
    }
  }
  return {
    brightness: data.length ? brightnessTotal / data.length : 0,
    blurScore: count ? Math.sqrt(laplacianTotal / count) : 0,
  };
}
