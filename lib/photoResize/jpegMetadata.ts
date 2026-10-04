/**
 * JPEG metadata helpers used by the browser resize pipeline.
 *
 * Canvas encoders intentionally write a new JPEG and, in doing so, drop the
 * source EXIF/XMP/ICC segments.  Keep the pixel conversion in the browser but
 * carry the source metadata segments over to the encoded JPEG afterwards.
 * The resized pixels are already upright, so EXIF Orientation is normalized
 * to 1 while every other metadata byte is preserved.
 */

const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;
const JPEG_APP1 = 0xe1;
const EXIF_ORIENTATION_TAG = 0x0112;
const TIFF_SHORT_TYPE = 3;
const EXIF_IDENTIFIER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] as const;

// APP1 = EXIF/XMP, APP2 = ICC profile, APP13 = IPTC/Photoshop metadata.
const PRESERVED_APP_MARKERS = new Set([0xe1, 0xe2, 0xed]);

function asBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

/**
 * Reads metadata segments from the header.  The scan data after SOS is never
 * parsed, so arbitrary compressed image bytes cannot be mistaken for markers.
 */
export function extractJpegMetadataSegments(input: ArrayBuffer | Uint8Array): Uint8Array[] {
  const bytes = asBytes(input);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== JPEG_SOI) return [];

  const segments: Uint8Array[] = [];
  let offset = 2;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const segmentStart = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;
    if (marker === JPEG_SOS || marker === JPEG_EOI) break;
    // RSTn/TEM/SOI are standalone markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === JPEG_SOI) continue;
    if (offset + 2 > bytes.length) break;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2) break;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.length) break;

    if (PRESERVED_APP_MARKERS.has(marker)) {
      // Include the marker and its complete length-delimited payload.
      segments.push(bytes.slice(segmentStart, segmentEnd));
    }
    offset = segmentEnd;
  }

  return segments;
}

function segmentsEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Returns a copy of an APP1 segment with the standard IFD0 Orientation value
 * normalized to 1. Invalid/non-EXIF APP1 payloads are returned unchanged.
 */
function normalizeExifOrientation(segment: Uint8Array): Uint8Array {
  const normalized = segment.slice();
  if (normalized.length < 18 || normalized[0] !== 0xff || normalized[1] !== JPEG_APP1) return normalized;

  const declaredLength = (normalized[2] << 8) | normalized[3];
  const segmentEnd = 2 + declaredLength;
  if (declaredLength < 2 || segmentEnd > normalized.length) return normalized;

  const exifStart = 4;
  if (EXIF_IDENTIFIER.some((byte, index) => normalized[exifStart + index] !== byte)) return normalized;

  const tiffStart = exifStart + EXIF_IDENTIFIER.length;
  const byteOrderFirst = normalized[tiffStart];
  const byteOrderSecond = normalized[tiffStart + 1];
  const littleEndian = byteOrderFirst === 0x49 && byteOrderSecond === 0x49;
  const bigEndian = byteOrderFirst === 0x4d && byteOrderSecond === 0x4d;
  if (!littleEndian && !bigEndian) return normalized;

  const view = new DataView(normalized.buffer, normalized.byteOffset, normalized.byteLength);
  const canRead = (offset: number, size: number) => offset >= tiffStart && offset + size <= segmentEnd;
  const readUint16 = (offset: number): number | null => (
    canRead(offset, 2) ? view.getUint16(offset, littleEndian) : null
  );
  const readUint32 = (offset: number): number | null => (
    canRead(offset, 4) ? view.getUint32(offset, littleEndian) : null
  );

  if (readUint16(tiffStart + 2) !== 42) return normalized;
  const ifd0RelativeOffset = readUint32(tiffStart + 4);
  if (ifd0RelativeOffset === null) return normalized;
  const ifd0Start = tiffStart + ifd0RelativeOffset;
  const entryCount = readUint16(ifd0Start);
  if (entryCount === null) return normalized;

  const entriesStart = ifd0Start + 2;
  if (!canRead(entriesStart, entryCount * 12)) return normalized;

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = entriesStart + index * 12;
    const tag = readUint16(entryOffset);
    if (tag !== EXIF_ORIENTATION_TAG) continue;

    const type = readUint16(entryOffset + 2);
    const count = readUint32(entryOffset + 4);
    if (type !== TIFF_SHORT_TYPE || count !== 1 || !canRead(entryOffset + 8, 2)) return normalized;

    view.setUint16(entryOffset + 8, 1, littleEndian);
    return normalized;
  }

  return normalized;
}

/**
 * Inserts source metadata immediately after the destination SOI marker.
 * Exact metadata segments already emitted by a future encoder are not added a
 * second time; separate APP1 segments (for example EXIF and XMP) are retained.
 */
export function preserveJpegMetadata(
  source: ArrayBuffer | Uint8Array,
  encoded: ArrayBuffer | Uint8Array,
): Uint8Array {
  const sourceSegments = extractJpegMetadataSegments(source).map(normalizeExifOrientation);
  const encodedBytes = asBytes(encoded);
  if (!sourceSegments.length || encodedBytes.length < 2 || encodedBytes[0] !== 0xff || encodedBytes[1] !== JPEG_SOI) {
    return encodedBytes;
  }

  const encodedSegments = extractJpegMetadataSegments(encoded);
  const segmentsToInsert = sourceSegments.filter((segment) => !encodedSegments.some((existing) => segmentsEqual(existing, segment)));
  if (!segmentsToInsert.length) return encodedBytes;

  const metadataLength = segmentsToInsert.reduce((total, segment) => total + segment.length, 0);
  const result = new Uint8Array(encodedBytes.length + metadataLength);
  result.set(encodedBytes.subarray(0, 2), 0);
  let offset = 2;
  for (const segment of segmentsToInsert) {
    result.set(segment, offset);
    offset += segment.length;
  }
  result.set(encodedBytes.subarray(2), offset);
  return result;
}
