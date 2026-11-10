import { describe, expect, it } from "vitest";

import { sortBridgeJpgs, type BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";

function photo(relativePath: string, lastModified: number, captureTimestamp?: number): BridgeJpgFile {
  const name = relativePath.split("/").at(-1) ?? relativePath;
  return {
    id: relativePath,
    name,
    relativeDirectory: relativePath.includes("/") ? relativePath.split("/").slice(0, -1).join("/") : "",
    relativePath,
    extension: "JPG",
    size: 1,
    lastModified,
    captureTimestamp,
    timestampSource: captureTimestamp === undefined ? undefined : "datetime_original",
  };
}

describe("sortBridgeJpgs", () => {
  it("파일명순은 경로를 포함한 자연 정렬을 유지한다", () => {
    const files = [photo("C2/_AK_10.JPG", 1), photo("C1/_AK_2.JPG", 2), photo("C1/_AK_1.JPG", 3)];
    expect(sortBridgeJpgs(files, "filename").map((item) => item.relativePath)).toEqual([
      "C1/_AK_1.JPG",
      "C1/_AK_2.JPG",
      "C2/_AK_10.JPG",
    ]);
  });

  it("촬영순은 EXIF 시각을 우선하고 같으면 파일명으로 안정 정렬한다", () => {
    const files = [photo("B.JPG", 30, 20), photo("C.JPG", 10, 10), photo("A.JPG", 40, 20)];
    expect(sortBridgeJpgs(files, "capture").map((item) => item.name)).toEqual(["C.JPG", "A.JPG", "B.JPG"]);
  });

  it("EXIF가 없으면 파일 수정시각으로 촬영순을 보완한다", () => {
    const files = [photo("later.JPG", 200), photo("first.JPG", 100)];
    expect(sortBridgeJpgs(files, "capture").map((item) => item.name)).toEqual(["first.JPG", "later.JPG"]);
  });
});
