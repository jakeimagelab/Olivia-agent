async function canvasJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("사진 변환 화면을 만들지 못했습니다.");
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("사진 미리보기를 만들지 못했습니다.")),
    "image/jpeg",
    quality,
  ));
}

export type JpegMetadata = { width: number; height: number; orientation: number };

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function exifOrientation(bytes: Uint8Array, start: number, end: number) {
  if (end - start < 14
    || bytes[start] !== 0x45 || bytes[start + 1] !== 0x78 || bytes[start + 2] !== 0x69 || bytes[start + 3] !== 0x66
    || bytes[start + 4] !== 0 || bytes[start + 5] !== 0) return null;
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  if (!little && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(tiff + 2, little) !== 42) return null;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd < tiff || ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) break;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    const orientation = view.getUint16(entry + 8, little);
    return orientation >= 1 && orientation <= 8 ? orientation : null;
  }
  return null;
}

/** JPEG 전체를 디코딩하지 않고 헤더에서 원본 크기와 회전 정보만 읽는다. */
export function parseJpegMetadata(value: ArrayBuffer | Uint8Array): JpegMetadata | null {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let orientation = 1;
  let width = 0;
  let height = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2) return null;
    const start = offset + 2;
    const end = offset + length;
    if (end > bytes.length) break;
    if (marker === 0xe1) orientation = exifOrientation(bytes, start, end) ?? orientation;
    if (JPEG_SOF_MARKERS.has(marker) && start + 5 <= end) {
      height = (bytes[start + 1] << 8) | bytes[start + 2];
      width = (bytes[start + 3] << 8) | bytes[start + 4];
    }
    offset = end;
  }
  return width > 0 && height > 0 ? { width, height, orientation } : null;
}

function previewDimensions(metadata: JpegMetadata, maxEdge: number) {
  const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
  const sourceWidth = rotated ? metadata.height : metadata.width;
  const sourceHeight = rotated ? metadata.width : metadata.height;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    sourceWidth,
    sourceHeight,
  };
}

export async function createPersonSelectDerivatives(file: File) {
  const header = await file.slice(0, 1024 * 1024).arrayBuffer();
  const metadata = parseJpegMetadata(header);
  let bitmap: ImageBitmap;
  let sourceWidth: number | null = null;
  let sourceHeight: number | null = null;
  if (metadata) {
    const dimensions = previewDimensions(metadata, 1600);
    sourceWidth = dimensions.sourceWidth;
    sourceHeight = dimensions.sourceHeight;
    try {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeWidth: dimensions.width,
        resizeHeight: dimensions.height,
        resizeQuality: "high",
      });
    } catch {
      bitmap = await createImageBitmap(file, {
        resizeWidth: dimensions.width,
        resizeHeight: dimensions.height,
        resizeQuality: "high",
      });
    }
  } else {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(file);
    }
  }
  try {
    const [thumb, preview] = await Promise.all([
      canvasJpeg(bitmap, 480, 0.72),
      canvasJpeg(bitmap, 1600, 0.8),
    ]);
    return { thumb, preview, sourceWidth: sourceWidth ?? bitmap.width, sourceHeight: sourceHeight ?? bitmap.height };
  } finally {
    bitmap.close();
  }
}
