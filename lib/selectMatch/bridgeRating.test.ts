import { describe, expect, it } from "vitest";
import { collectBridgeSidecarRatedNames, readRatingFromXmpText } from "@/lib/selectMatch/bridgeRating";
import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";

function sidecarDirectory(ratings: Record<string, string>): FileSystemDirectoryHandle {
  return {
    name: "scene",
    kind: "directory",
    async getFileHandle(name: string) {
      const text = ratings[name];
      if (!text) throw new DOMException("Not found", "NotFoundError");
      return { getFile: async () => ({ text: async () => text }) } as FileSystemFileHandle;
    },
  } as FileSystemDirectoryHandle;
}

function group(ratings: Record<string, string>): SelectMatchFolderGroup {
  return {
    name: "scene",
    dirHandle: sidecarDirectory(ratings),
    photos: ["DSC_001", "DSC_002", "DSC_003"].map((basename) => ({
      name: `${basename}.jpg`,
      basename,
      handle: {} as FileSystemFileHandle,
      thumbUrl: null,
      rating: null,
    })),
  };
}

describe("Bridge 별점 사이드카", () => {
  it("element와 attribute 형식의 1~5점만 읽는다", () => {
    expect(readRatingFromXmpText("<xmp:Rating>5</xmp:Rating>")).toBe(5);
    expect(readRatingFromXmpText("xmp:Rating='3'")).toBe(3);
    expect(readRatingFromXmpText('xmp:Rating="0"')).toBeNull();
  });

  it("별점 사이드카가 있는 JPG만 소문자 basename으로 반환한다", async () => {
    const result = await collectBridgeSidecarRatedNames([group({
      "DSC_001.xmp": '<rdf:Description xmp:Rating="4" />',
      "DSC_003.XMP": "<xmp:Rating>1</xmp:Rating>",
    })]);

    expect(result).toEqual({
      names: new Set(["dsc_001", "dsc_003"]),
      scanned: 3,
      rated: 2,
    });
  });

  it("사이드카가 없으면 전체 JPG로 대체하지 않는다", async () => {
    const result = await collectBridgeSidecarRatedNames([group({})]);
    expect(result.names).toEqual(new Set());
    expect(result.scanned).toBe(3);
  });
});
