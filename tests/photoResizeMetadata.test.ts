import { describe, expect, it } from "vitest";
import { extractJpegMetadataSegments, preserveJpegMetadata } from "@/lib/photoResize/jpegMetadata";

const exifPayload = new TextEncoder().encode("Exif\0\0OLIVIA-EXIF");
const exifSegment = Uint8Array.from([
  0xff,
  0xe1,
  (exifPayload.length + 2) >> 8,
  (exifPayload.length + 2) & 0xff,
  ...exifPayload,
]);

describe("JPEG metadata preservation", () => {
  it("copies EXIF APP1 metadata into a canvas-encoded JPEG", () => {
    const source = Uint8Array.from([0xff, 0xd8, ...exifSegment, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
    const encoded = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);

    const restored = preserveJpegMetadata(source, encoded);
    expect(extractJpegMetadataSegments(restored)).toHaveLength(1);
    expect(Array.from(restored.slice(2, 2 + exifSegment.length))).toEqual(Array.from(exifSegment));
  });

  it("does not duplicate metadata when the encoder already includes the marker", () => {
    const source = Uint8Array.from([0xff, 0xd8, ...exifSegment, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
    const encoded = Uint8Array.from([0xff, 0xd8, ...exifSegment, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
    expect(extractJpegMetadataSegments(preserveJpegMetadata(source, encoded))).toHaveLength(1);
  });
});
