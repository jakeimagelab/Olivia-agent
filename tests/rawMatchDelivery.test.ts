import { describe, expect, it } from "vitest";
import {
  buildDeliveredJpgMovePlan,
  DEFAULT_RAW_MATCH_CRITERIA,
  isDeliveredRoundFolder,
  nextDeliveredRoundFolderName,
  resolveRawMatchTargets,
} from "@/lib/photo-bridge/rawMatchDelivery";

describe("RAW 매칭 기준", () => {
  const names = ["A.JPG", "B.jpg", "C.jpeg", "D.JPG", "NONE.JPG"];
  const ratingsByName = { A: 1, b: 3, C: 5 };
  const colorsByName = { a: 7, D: 6 };

  it("저장된 기준이 없을 때 별점 ★1 이상이 기본이다", () => {
    expect(DEFAULT_RAW_MATCH_CRITERIA).toEqual({ source: "rating", minRating: 1, colorLabels: [6, 7, 8, 9] });
  });

  it("기본 별점과 별점 하한을 적용한다", () => {
    expect([...resolveRawMatchTargets({ names, ratingsByName, colorsByName, criteria: { source: "rating", minRating: 1, colorLabels: [6, 7, 8, 9] } })]).toEqual(["a", "b", "c"]);
    expect([...resolveRawMatchTargets({ names, ratingsByName, colorsByName, criteria: { source: "rating", minRating: 3, colorLabels: [6, 7, 8, 9] } })]).toEqual(["b", "c"]);
  });

  it("컬러 한 종류와 둘 다 합집합을 계산하고 표시가 없는 사진은 제외한다", () => {
    expect([...resolveRawMatchTargets({ names, ratingsByName, colorsByName, criteria: { source: "color", minRating: 1, colorLabels: [6] } })]).toEqual(["d"]);
    expect([...resolveRawMatchTargets({ names, ratingsByName, colorsByName, criteria: { source: "both", minRating: 3, colorLabels: [6] } })]).toEqual(["b", "c", "d"]);
  });
});

describe("보정본 전달 폴더", () => {
  it("기존 회차 다음 이름을 만든다", () => {
    expect(nextDeliveredRoundFolderName([])).toBe("1차보정본");
    expect(nextDeliveredRoundFolderName(["1차보정본", "2차보정본", "메모"])).toBe("3차보정본");
  });

  it("회차 보정본 폴더만 구분한다", () => {
    expect(isDeliveredRoundFolder("1차보정본")).toBe(true);
    expect(isDeliveredRoundFolder("1차촬영")).toBe(false);
    expect(isDeliveredRoundFolder("2차(프로필)")).toBe(false);
  });

  it("RAW가 복사된 JPG와 같은 폴더·같은 이름 XMP만 계획한다", () => {
    expect(buildDeliveredJpgMovePlan({
      rawMatchedNames: ["A"],
      jpgs: [
        { name: "A.JPG", directoryKey: "scene-1" },
        { name: "B.JPG", directoryKey: "scene-1" },
      ],
      sidecars: [
        { name: "A.xMp", directoryKey: "scene-1" },
        { name: "A.xmp", directoryKey: "scene-2" },
        { name: "B.xmp", directoryKey: "scene-1" },
      ],
    })).toEqual([
      { name: "A.JPG", directoryKey: "scene-1", kind: "jpg", basename: "a" },
      { name: "A.xMp", directoryKey: "scene-1", kind: "xmp", basename: "a" },
    ]);
  });
});
