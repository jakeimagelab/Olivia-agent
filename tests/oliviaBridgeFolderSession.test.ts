import { describe, expect, it } from "vitest";

import {
  bridgeFolderMarksByName,
  readBridgeFolderMarks,
  readBridgeFolderSelectionSource,
  remoteBridgeThumbnailsToJpgs,
} from "@/lib/photo-bridge/folderSession";

function storageWith(values: Record<string, string>) {
  return {
    getItem(key: string) {
      return values[key] ?? null;
    },
  };
}

describe("Bridge folder session", () => {
  it("폴더별 셀렉 기준을 읽고 저장소 오류에는 올리비아를 사용한다", () => {
    expect(readBridgeFolderSelectionSource(storageWith({
      "olivia-bridge-selection-source:촬영/JPG": "both",
    }), "촬영/JPG")).toBe("both");
    expect(readBridgeFolderSelectionSource(storageWith({}), "촬영/JPG")).toBe("olivia");
    expect(readBridgeFolderSelectionSource({ getItem: () => { throw new Error("blocked"); } }, "촬영/JPG")).toBe("olivia");
  });

  it("폴더 표시값을 정규화하고 손상된 저장값은 빈 상태로 복구한다", () => {
    const key = "olivia-bridge:marks:촬영 / JPG";
    const marks = readBridgeFolderMarks(storageWith({
      [key]: JSON.stringify({
        ratings: { one: 1, five: 5, zero: 0, invalid: 9 },
        ratingEdits: { one: 0, five: 5, invalid: 8 },
        colorLabels: { one: 6, five: 9, invalid: 5 },
        excluded: ["one", 3, "five"],
      }),
    }), "촬영 / JPG");

    expect(marks.ratings).toEqual({ one: 1, five: 5 });
    expect(marks.ratingEdits).toEqual({ one: 0, five: 5 });
    expect(marks.colorLabels).toEqual({ one: 6, five: 9 });
    expect([...marks.excludedIds]).toEqual(["one", "five"]);

    const empty = readBridgeFolderMarks(storageWith({ [key]: "{" }), "촬영 / JPG");
    expect(empty.ratings).toEqual({});
    expect(empty.colorLabels).toEqual({});
    expect(empty.excludedIds.size).toBe(0);
  });

  it("사진 ID 기준 표시값을 공용 파일명 저장소 값으로 변환한다", () => {
    expect(bridgeFolderMarksByName(
      [{ id: "a", name: "A.JPG" }, { id: "b", name: "B.JPG" }],
      { a: 5 },
      { b: 6 },
    )).toEqual({
      ratings: { "A.JPG": 5 },
      colorLabels: { "A.JPG": 0, "B.JPG": 6 },
    });
  });

  it("NAS 썸네일을 Bridge 사진 모델로 같은 규칙으로 변환한다", () => {
    const [photo] = remoteBridgeThumbnailsToJpgs("촬영/JPG", [{
      relativePath: "하위/A.JPG",
      name: "A.JPG",
      size: 123,
      lastModified: 456,
      captureTimestamp: 400,
      timestampSource: "datetime_original",
      dataUrl: "data:image/jpeg;base64,AA==",
    }]);

    expect(photo).toMatchObject({
      id: "촬영/JPG:하위/A.JPG:123:456",
      name: "A.JPG",
      relativeDirectory: "하위",
      relativePath: "하위/A.JPG",
      extension: "JPG",
      thumbnailUrl: "data:image/jpeg;base64,AA==",
      captureTimestamp: 400,
      timestampSource: "datetime_original",
    });
  });
});
