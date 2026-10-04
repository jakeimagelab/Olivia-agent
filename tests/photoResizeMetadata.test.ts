import { describe, expect, it } from "vitest";
import { extractJpegMetadataSegments, preserveJpegMetadata } from "@/lib/photoResize/jpegMetadata";

const exifPayload = new TextEncoder().encode("Exif\0\0OLIVIA-EXIF");

function appSegment(marker: number, payload: Uint8Array): Uint8Array {
  return Uint8Array.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]);
}

const exifSegment = appSegment(0xe1, exifPayload);

function jpeg(...segments: Uint8Array[]): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...segments.flatMap((segment) => Array.from(segment)), 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}

function tiffExifSegment(byteOrder: "II" | "MM", orientation?: number): { segment: Uint8Array; orientationValueOffset?: number } {
  const littleEndian = byteOrder === "II";
  const entryCount = orientation === undefined ? 1 : 2;
  const tiff = new Uint8Array(8 + 2 + entryCount * 12 + 4);
  const view = new DataView(tiff.buffer);
  tiff[0] = byteOrder.charCodeAt(0);
  tiff[1] = byteOrder.charCodeAt(1);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, entryCount, littleEndian);

  let entryOffset = 10;
  let orientationValueOffset: number | undefined;
  if (orientation !== undefined) {
    view.setUint16(entryOffset, 0x0112, littleEndian);
    view.setUint16(entryOffset + 2, 3, littleEndian);
    view.setUint32(entryOffset + 4, 1, littleEndian);
    view.setUint16(entryOffset + 8, orientation, littleEndian);
    orientationValueOffset = 4 + 6 + entryOffset + 8;
    entryOffset += 12;
  }

  // Keep a second inline IFD0 value so the tests verify non-Orientation bytes.
  view.setUint16(entryOffset, 0x010f, littleEndian);
  view.setUint16(entryOffset + 2, 2, littleEndian);
  view.setUint32(entryOffset + 4, 4, littleEndian);
  tiff.set([0x43, 0x41, 0x4e, 0x00], entryOffset + 8); // "CAN\0"
  view.setUint32(10 + entryCount * 12, 0, littleEndian);

  const payload = Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]);
  return { segment: appSegment(0xe1, payload), orientationValueOffset };
}

describe("JPEG metadata preservation", () => {
  it("copies EXIF APP1 metadata into a canvas-encoded JPEG", () => {
    const source = jpeg(exifSegment);
    const encoded = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);

    const restored = preserveJpegMetadata(source, encoded);
    expect(extractJpegMetadataSegments(restored)).toHaveLength(1);
    expect(Array.from(restored.slice(2, 2 + exifSegment.length))).toEqual(Array.from(exifSegment));
  });

  it("does not duplicate metadata when the encoder already includes the marker", () => {
    const source = jpeg(exifSegment);
    const encoded = jpeg(exifSegment);
    expect(extractJpegMetadataSegments(preserveJpegMetadata(source, encoded))).toHaveLength(1);
  });

  it.each(["II", "MM"] as const)("normalizes %s IFD0 Orientation 8 to 1 and changes no other EXIF byte", (byteOrder) => {
    const { segment, orientationValueOffset } = tiffExifSegment(byteOrder, 8);
    const encoded = jpeg();
    const [normalized] = extractJpegMetadataSegments(preserveJpegMetadata(jpeg(segment), encoded));
    const expected = segment.slice();
    const littleEndian = byteOrder === "II";
    new DataView(expected.buffer).setUint16(orientationValueOffset!, 1, littleEndian);
    expect(normalized).toEqual(expected);
  });

  it("leaves Orientation 1 and EXIF without Orientation byte-for-byte unchanged", () => {
    const orientationOne = tiffExifSegment("II", 1).segment;
    const noOrientation = tiffExifSegment("II").segment;
    expect(extractJpegMetadataSegments(preserveJpegMetadata(jpeg(orientationOne), jpeg()))[0]).toEqual(orientationOne);
    expect(extractJpegMetadataSegments(preserveJpegMetadata(jpeg(noOrientation), jpeg()))[0]).toEqual(noOrientation);
  });

  it("preserves XMP, ICC and IPTC segments while only normalizing EXIF Orientation", () => {
    const { segment: exif, orientationValueOffset } = tiffExifSegment("II", 8);
    const xmp = appSegment(0xe1, new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0<xmp />"));
    const icc = appSegment(0xe2, new TextEncoder().encode("ICC_PROFILE\0profile-data"));
    const iptc = appSegment(0xed, new TextEncoder().encode("Photoshop 3.0\0iptc-data"));
    const restored = extractJpegMetadataSegments(preserveJpegMetadata(jpeg(exif, xmp, icc, iptc), jpeg()));
    const expectedExif = exif.slice();
    new DataView(expectedExif.buffer).setUint16(orientationValueOffset!, 1, true);
    expect(restored).toEqual([expectedExif, xmp, icc, iptc]);
  });

  it("does not throw or rewrite malformed EXIF metadata", () => {
    const malformed = appSegment(0xe1, Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49]));
    expect(extractJpegMetadataSegments(preserveJpegMetadata(jpeg(malformed), jpeg()))[0]).toEqual(malformed);
  });
});
