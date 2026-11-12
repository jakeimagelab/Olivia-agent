import { describe, expect, it } from "vitest";

import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  projectBridgeColorLabelsByName,
  projectBridgeRatingsByName,
  projectBridgeSelectedFiles,
  projectBridgeSelectedNames,
  resolveBridgeRatingsByName,
  resolveBridgeSelectedIdsByName,
} from "@/lib/photo-bridge/selectionProjection";

function photo(id: string, name: string, file?: File): BridgeJpgFile {
  return {
    id,
    name,
    relativeDirectory: "",
    relativePath: name,
    extension: "JPG",
    file,
    size: file?.size ?? 0,
    lastModified: file?.lastModified ?? 0,
  };
}

describe("Bridge selection projection", () => {
  it("선택 ID를 사진 순서의 이름과 사용 가능한 File로 투영한다", () => {
    const first = new File(["first"], "FIRST.JPG", { lastModified: 10 });
    const third = new File(["third"], "THIRD.JPG", { lastModified: 30 });
    const jpgs = [
      photo("a", "FIRST.JPG", first),
      photo("b", "SECOND.JPG"),
      photo("c", "THIRD.JPG", third),
    ];

    expect(projectBridgeSelectedNames(jpgs, new Set(["c", "a"]))).toEqual(["FIRST.JPG", "THIRD.JPG"]);
    expect(projectBridgeSelectedFiles(jpgs, new Set(["a", "b", "c"]))).toEqual([first, third]);
  });

  it("별점과 컬러를 모든 사진 이름에 0 기본값을 포함해 투영한다", () => {
    const jpgs = [photo("a", "A.JPG"), photo("b", "B.JPG")];

    expect(projectBridgeRatingsByName(jpgs, { a: 5 })).toEqual({ "A.JPG": 5, "B.JPG": 0 });
    expect(projectBridgeColorLabelsByName(jpgs, { b: 8 })).toEqual({ "A.JPG": 0, "B.JPG": 8 });
  });

  it("대소문자·확장자·NFC 차이를 무시해 이름을 ID와 별점으로 복원한다", () => {
    const composed = "가나다.JPG".normalize("NFC");
    const decomposed = composed.normalize("NFD");
    const jpgs = [photo("a", composed), photo("b", "SECOND.JPEG")];

    expect(resolveBridgeSelectedIdsByName(jpgs, [`folder/${decomposed.toLocaleLowerCase("en-US")}`, "second.jpg"])).toEqual(new Set(["a", "b"]));
    expect(resolveBridgeRatingsByName(jpgs, {
      [decomposed.replace(/\.JPG$/, "").toLocaleLowerCase("en-US")]: 4,
      second: 2,
    })).toEqual({ a: 4, b: 2 });
  });

  it("0점과 현재 폴더에 없는 이름은 복원 결과에서 제외한다", () => {
    const jpgs = [photo("a", "A.JPG"), photo("b", "B.JPG")];

    expect(resolveBridgeSelectedIdsByName(jpgs, ["missing.jpg"])).toEqual(new Set());
    expect(resolveBridgeRatingsByName(jpgs, { a: 0, missing: 5 })).toEqual({});
  });
});
