import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { parse as parseExif } from "exifr";
import sharp, { type Metadata } from "sharp";

import { preserveJpegMetadata } from "@/lib/photoResize/jpegMetadata";
import type { PhotoEditImage } from "@/lib/photo-edit/types";

const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

export type DecodedJpeg = PhotoEditImage & {
  sourceBytes: Uint8Array;
  convertedToSrgb: boolean;
  exif: {
    iso: number | null;
    lens: string | null;
    aperture: number | null;
    shutter: string | null;
    capturedAt: string | null;
  };
};

function isSrgbMetadata(metadata: Metadata): boolean {
  if (metadata.icc?.length) {
    const profile = metadata.icc.toString("latin1").toLowerCase();
    return profile.includes("srgb")
      || profile.includes("iec 61966")
      || profile.includes("iec61966");
  }
  const declaredSpace = metadata.space?.toLowerCase();
  return !declaredSpace || declaredSpace === "srgb";
}

function stripJpegIccSegments(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return input;
  const chunks: Uint8Array[] = [input.subarray(0, 2)];
  let offset = 2;
  while (offset + 3 < input.length && input[offset] === 0xff) {
    const start = offset;
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    const marker = input[offset++];
    if (marker === JPEG_SOS || marker === JPEG_EOI) {
      chunks.push(input.subarray(start));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8) {
      chunks.push(input.subarray(start, offset));
      continue;
    }
    if (offset + 2 > input.length) break;
    const length = (input[offset] << 8) | input[offset + 1];
    const end = offset + length;
    if (length < 2 || end > input.length) break;
    // APP2 is also used by non-ICC payloads. Remove only the ICC signature.
    const signature = String.fromCharCode(...input.subarray(offset + 2, Math.min(end, offset + 14)));
    const isIcc = marker === 0xe2 && signature.startsWith("ICC_PROFILE");
    if (!isIcc) chunks.push(input.subarray(start, end));
    offset = end;
  }
  if (chunks.length === 1 && offset < input.length) chunks.push(input.subarray(offset));
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}

function rationalString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 1) return `${value.toFixed(value % 1 ? 1 : 0)}초`;
    return `1/${Math.max(1, Math.round(1 / value))}초`;
  }
  return null;
}

export async function decodeJpegForPhotoEdit(filePath: string): Promise<DecodedJpeg> {
  const sourceBytes = new Uint8Array(await readFile(filePath));
  const source = sharp(sourceBytes, { failOn: "none" });
  const metadata = await source.metadata();
  const rendered = await source.rotate().toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (rendered.info.channels !== 3) throw new Error(`${path.basename(filePath)}을 RGB로 읽지 못했습니다.`);
  const exif = await parseExif(sourceBytes, ["ISO", "LensModel", "FNumber", "ExposureTime", "DateTimeOriginal"]).catch(() => undefined) as Record<string, unknown> | undefined;
  const captured = exif?.DateTimeOriginal;
  return {
    data: new Uint8Array(rendered.data.buffer, rendered.data.byteOffset, rendered.data.byteLength),
    width: rendered.info.width,
    height: rendered.info.height,
    sourceBytes,
    convertedToSrgb: !isSrgbMetadata(metadata),
    exif: {
      iso: typeof exif?.ISO === "number" ? exif.ISO : null,
      lens: typeof exif?.LensModel === "string" ? exif.LensModel : null,
      aperture: typeof exif?.FNumber === "number" ? exif.FNumber : null,
      shutter: rationalString(exif?.ExposureTime),
      capturedAt: captured instanceof Date ? captured.toISOString() : typeof captured === "string" ? captured : null,
    },
  };
}

export async function encodeEditedJpeg(
  sourceBytes: Uint8Array,
  image: PhotoEditImage,
): Promise<Uint8Array> {
  const encoded = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .withIccProfile("srgb")
    .jpeg({ quality: 100, chromaSubsampling: "4:4:4", mozjpeg: false })
    .toBuffer();
  // The encoded JPEG already has the correct sRGB profile. Preserve EXIF/XMP/IPTC
  // from a source copy without its old ICC so Adobe RGB is never reattached.
  return preserveJpegMetadata(stripJpegIccSegments(sourceBytes), encoded);
}

export async function writeEditedJpeg(
  destinationPath: string,
  sourceBytes: Uint8Array,
  image: PhotoEditImage,
): Promise<void> {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, await encodeEditedJpeg(sourceBytes, image));
}

export async function createJpegPreview(source: string | Uint8Array, maxEdge = 2_000): Promise<Buffer> {
  return sharp(source, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
