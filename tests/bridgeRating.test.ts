import { describe, expect, it, vi } from "vitest";

import { collectAdobeBridgeMarks, collectAdobeBridgeRatings, readColorLabelFromXmpText } from "@/lib/selectMatch/bridgeRating";

function xmpFile(rating?: number) {
  const text = rating
    ? `<x:xmpmeta><rdf:Description xmp:Rating="${rating}" /></x:xmpmeta>`
    : "no rating";
  return new Blob([text], { type: "image/jpeg" }) as File;
}

function directory(input: {
  files?: Record<string, File>;
  directories?: Record<string, FileSystemDirectoryHandle>;
}) {
  return {
    getFileHandle: vi.fn(async (name: string) => {
      const file = input.files?.[name];
      if (!file) throw new DOMException("Not found", "NotFoundError");
      return { getFile: async () => file } as FileSystemFileHandle;
    }),
    getDirectoryHandle: vi.fn(async (name: string) => {
      const child = input.directories?.[name];
      if (!child) throw new DOMException("Not found", "NotFoundError");
      return child;
    }),
  } as unknown as FileSystemDirectoryHandle;
}

describe("Adobe Bridge rating sync", () => {
  it("reads the default Adobe color labels used by RAW select", () => {
    expect(readColorLabelFromXmpText('<rdf:Description xmp:Label="Select" />')).toBe(6);
    expect(readColorLabelFromXmpText("<xmp:Label>Review</xmp:Label>")).toBe(9);
  });

  it("reads rating and color together from a RAW sidecar", async () => {
    const root = directory({ files: { "IMG_1000.xmp": new Blob(['<rdf:Description xmp:Rating="5" xmp:Label="Approved" />']) as File } });
    const result = await collectAdobeBridgeMarks(root, [{ name: "IMG_1000.CR3" }]);
    expect(result.get("img_1000")).toEqual({ rating: 5, colorLabel: 8 });
  });
  it("re-reads the file handle so ratings written after the folder scan are visible", async () => {
    const getFile = vi.fn(async () => xmpFile(4));
    const root = directory({});

    const result = await collectAdobeBridgeRatings(root, [{
      name: "IMG_1001.JPG",
      file: xmpFile(),
      handle: { getFile } as unknown as FileSystemFileHandle,
    }]);

    expect(getFile).toHaveBeenCalledOnce();
    expect(result.get("img_1001")).toBe(4);
  });

  it("reads an XMP sidecar from the photo's nested directory", async () => {
    const scene = directory({ files: { "IMG_2001.xmp": xmpFile(5) } });
    const day = directory({ directories: { "Scene 1": scene } });
    const root = directory({ directories: { "Day 1": day } });

    const result = await collectAdobeBridgeRatings(root, [{
      name: "IMG_2001.JPG",
      file: xmpFile(),
      relativeDirectory: "Day 1/Scene 1",
    }]);

    expect(result.get("img_2001")).toBe(5);
  });

  it("does not mistake a folder rating for a photo rating", async () => {
    const root = directory({
      files: {
        ".BridgeLabelsAndRatings": new Blob([
          "<bridgedata><ratings><item key='Profile' rating='5'/></ratings></bridgedata>",
        ]) as File,
      },
    });

    const result = await collectAdobeBridgeRatings(root, [{
      name: "Profile.JPG",
      file: xmpFile(),
    }]);

    expect(result.size).toBe(0);
  });
});
