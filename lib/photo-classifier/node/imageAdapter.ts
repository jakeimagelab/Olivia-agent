import { open, stat } from "node:fs/promises";
import sharp from "sharp";
import { parseExifTimestamp } from "@/lib/photo-classifier/timestamp";
import type { LocalVisualFeatures, TimestampSource } from "@/lib/photo-classifier/hybrid-types";
import { extractVisualFeaturesFromImageData } from "@/lib/photo-classifier/visual-feature";

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export async function readNodePhotoTimestamp(filePath: string): Promise<{
  timestamp: number;
  source: TimestampSource;
  warning?: string;
}> {
  const metadata = await stat(filePath);
  const handle = await open(filePath, "r");
  try {
    const length = Math.min(metadata.size, 256 * 1024);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const exif = parseExifTimestamp(toArrayBuffer(buffer.subarray(0, bytesRead)));
    if (exif) return { timestamp: exif.timestamp, source: exif.source };
    return {
      timestamp: metadata.mtimeMs,
      source: "mtime",
      warning: "EXIF 촬영시간 없음 — mtime 사용",
    };
  } finally {
    await handle.close();
  }
}

async function rgbaPixels(filePath: string, maxSize: number): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const { data, info } = await sharp(filePath, { failOn: "warning" })
    .rotate()
    .resize({
      width: maxSize,
      height: maxSize,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

export async function extractNodeVisualFeatures(filePath: string): Promise<LocalVisualFeatures> {
  return extractVisualFeaturesFromImageData(await rgbaPixels(filePath, 384));
}

export async function createNodeApiImage(
  filePath: string,
  options: { maxSize?: number; quality?: number } = {},
): Promise<string> {
  const data = await sharp(filePath, { failOn: "warning" })
    .rotate()
    .resize({
      width: options.maxSize ?? 480,
      height: options.maxSize ?? 480,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: Math.round((options.quality ?? 0.6) * 100) })
    .toBuffer();
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

export async function analyzeNodeJpgQuality(filePath: string): Promise<{
  blurScore: number;
  brightness: number;
}> {
  const { data, width, height } = await rgbaPixels(filePath, 280);
  const gray = new Float32Array(width * height);
  let brightnessTotal = 0;
  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4;
    const value = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    gray[index] = value;
    brightnessTotal += value;
  }

  let laplacianTotal = 0;
  let laplacianCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = y * width + x;
      const laplacian = gray[center] * 4
        - gray[(y - 1) * width + x]
        - gray[(y + 1) * width + x]
        - gray[y * width + x - 1]
        - gray[y * width + x + 1];
      laplacianTotal += laplacian * laplacian;
      laplacianCount += 1;
    }
  }

  return {
    blurScore: laplacianCount > 0 ? Math.sqrt(laplacianTotal / laplacianCount) : 0,
    brightness: gray.length > 0 ? brightnessTotal / gray.length : 0,
  };
}
