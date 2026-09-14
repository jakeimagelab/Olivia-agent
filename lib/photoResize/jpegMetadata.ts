/**
 * JPEG metadata helpers used by the browser resize pipeline.
 *
 * Canvas encoders intentionally write a new JPEG and, in doing so, drop the
 * source EXIF/XMP/ICC segments.  Keep the pixel conversion in the browser but
 * carry the source metadata segments over to the encoded JPEG afterwards.
 * This is byte-level work only; no metadata values are invented or rewritten.
 */

const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;

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
 * Inserts source metadata immediately after the destination SOI marker.
 * Exact metadata segments already emitted by a future encoder are not added a
 * second time; separate APP1 segments (for example EXIF and XMP) are retained.
 */
export function preserveJpegMetadata(
  source: ArrayBuffer | Uint8Array,
  encoded: ArrayBuffer | Uint8Array,
): Uint8Array {
  const sourceSegments = extractJpegMetadataSegments(source);
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
