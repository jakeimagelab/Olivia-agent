import { describe, expect, it, vi } from "vitest";

import { collectAdobeBridgeRatings, readBridgeRatingsManifestText } from "@/lib/selectMatch/bridgeRating";

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
  it("reads Adobe Bridge's folder rating manifest", () => {
    const result = readBridgeRatingsManifestText(`<?xml version='1.0' encoding='UTF-8'?>
      <bridgedata><ratings>
        <item key='IMG_1001.JPG' rating='5'/>
        <item rating="3" key="IMG_1002"/>
        <item key='ignored.jpg' rating='0'/>
      </ratings></bridgedata>`);

    expect([...result.entries()]).toEqual([
      ["img_1001.jpg", 5],
      ["img_1002", 3],
    ]);
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

  it("uses a .BridgeLabelsAndRatings entry when Bridge cannot write XMP into the photo", async () => {
    const root = directory({
      files: {
        ".BridgeLabelsAndRatings": new Blob([
          "<bridgedata><ratings><item key='IMG_3001.JPG' rating='4'/></ratings></bridgedata>",
        ]) as File,
      },
    });

    const result = await collectAdobeBridgeRatings(root, [{
      name: "IMG_3001.JPG",
      file: xmpFile(),
    }]);

    expect(result.get("img_3001")).toBe(4);
  });
});
