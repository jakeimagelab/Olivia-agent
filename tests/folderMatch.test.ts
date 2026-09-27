import { describe, expect, it } from "vitest";
import {
  folderCoreName,
  resolveFolderTargets,
} from "@/lib/photo-storage/folderMatch";

const FOLDERS = [
  "0923_연세라이프구강",
  "0918_삼칠갈비",
  "1989 청담스시",
  "0917_르셀청담",
  "0921_더스타일정형외과",
];

function names(message: string, folders: readonly string[] = FOLDERS): string[][] {
  const result = resolveFolderTargets(message, folders);
  return result.kind === "targets"
    ? result.groups.map((group) => group.map((match) => match.displayName))
    : [];
}

describe("folderCoreName", () => {
  it.each([
    ["0923_연세라이프구강", "연세라이프구강"],
    ["1989 청담스시", "청담스시"],
    ["20260923_연세라이프구강", "연세라이프구강"],
    ["연세라이프구강", "연세라이프구강"],
    ["0923", "0923"],
  ])("%s의 핵심 이름은 %s다", (input, expected) => {
    expect(folderCoreName(input)).toBe(expected);
  });
});

describe("실제 폴더 목록 기반 메시지 매칭", () => {
  it.each([
    "연세라이프구강내과 1차 분류 좀 해줘",
    "0923_연세라이프구강 1차 분류 좀 해줘",
    "연세라이프구강 찾아서 분류해라",
    "연세라이프구강 분류해줘",
    "연세라이프구강 좀 분류해줘",
    "연세라이프구강을 1차 분류 해주세요",
    "워크스테이션에서 연세라이프구강 찾아서 1차 분류",
    "올리비아야, 연세라이프구강 1차 분류 좀 부탁해",
    "연세라이프구강내과 촬영 폴더 1차 분류 진행해",
  ])("군말이나 진료과 접미사를 추출하지 않고 실제 폴더를 찾는다: %s", (message) => {
    expect(names(message)).toEqual([["0923_연세라이프구강"]]);
  });

  it.each([
    "삼칠갈비와 르셀청담 1차 분류 해줘",
    "삼칠갈비랑 르셀청담 1차 분류 해줘",
    "삼칠갈비, 르셀청담 1차 분류 해줘",
    "삼칠갈비하고 르셀청담 둘 다 분류해줘",
    "삼칠갈비 르셀청담 분류",
  ])("구분자 종류와 무관하게 여러 폴더를 말한 순서대로 찾는다: %s", (message) => {
    expect(names(message)).toEqual([["0918_삼칠갈비"], ["0917_르셀청담"]]);
  });

  it("역순으로 말하면 작업 순서도 역순이다", () => {
    expect(names("르셀청담이랑 삼칠갈비 분류해줘")).toEqual([
      ["0917_르셀청담"],
      ["0918_삼칠갈비"],
    ]);
  });

  it("단어 중간에서 시작하는 짧은 폴더명은 잡지 않는다(R1)", () => {
    expect(names("르셀청담 분류해줘", [...FOLDERS, "청담"])).toEqual([["0917_르셀청담"]]);
  });

  it("3글자 이하 핵심 이름은 끝 경계까지 확인한다(R2)", () => {
    expect(names("강남역 촬영분 분류", [...FOLDERS, "강남"])).toEqual([]);
    expect(names("강남 분류해줘", [...FOLDERS, "강남"])).toEqual([["강남"]]);
  });

  it("같은 범위를 포함하는 더 구체적인 폴더만 남긴다(R3)", () => {
    expect(names("연세라이프구강내과 분류", [...FOLDERS, "연세라이프구강내과"])).toEqual([
      ["연세라이프구강내과"],
    ]);
  });

  it("같은 핵심 이름의 날짜별 폴더는 한 그룹의 모호 후보로 남긴다", () => {
    expect(names("연세라이프구강 분류해줘", [...FOLDERS, "0924_연세라이프구강"])).toEqual([
      ["0923_연세라이프구강", "0924_연세라이프구강"],
    ]);
  });

  it("전체 폴더명을 말하면 날짜별 모호성 없이 정확히 고른다", () => {
    expect(names("0924_연세라이프구강 분류해줘", [...FOLDERS, "0924_연세라이프구강"])).toEqual([
      ["0924_연세라이프구강"],
    ]);
  });

  it.each(["없는병원 1차 분류 해줘", "1차 분류 좀 해줘"])("목록에 없는 대상은 none이다: %s", (message) => {
    expect(resolveFolderTargets(message, FOLDERS)).toEqual({ kind: "none" });
  });

  it("띄어쓰기와 구분자를 제거한 전체 이름을 맞춘다", () => {
    expect(names("0918 삼 칠 갈비 1차 분류")).toEqual([["0918_삼칠갈비"]]);
  });

  it("날짜를 말하지 않아도 핵심 이름으로 맞춘다", () => {
    expect(names("청담스시 2차 분류 해줘")).toEqual([["1989 청담스시"]]);
  });
});
