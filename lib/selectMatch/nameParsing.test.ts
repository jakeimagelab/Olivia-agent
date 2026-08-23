import { describe, expect, it } from "vitest";
import { parseNamesFromText, parseNamesFromFiles, SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";

describe("parseNamesFromText — 텍스트에서 파일명 추출", () => {
  it("쉼표/줄바꿈으로 섞인 파일명을 확장자 제거 후 소문자로 추출한다", () => {
    const text = "DSC_0142.jpg, DSC_0145.jpg\nDSC_0148.JPG";
    expect(parseNamesFromText(text)).toEqual(new Set(["dsc_0142", "dsc_0145", "dsc_0148"]));
  });

  it("RAW 확장자도 추출한다", () => {
    expect(parseNamesFromText("A001.ARW B002.cr2")).toEqual(new Set(["a001", "b002"]));
  });

  it("파일명이 없는 텍스트는 빈 Set을 돌려준다", () => {
    expect(parseNamesFromText("아무 내용도 없어요")).toEqual(new Set());
  });

  it("중복 파일명은 한 번만 담는다", () => {
    expect(parseNamesFromText("A.jpg A.JPG a.jpg")).toEqual(new Set(["a"]));
  });
});

describe("parseNamesFromFiles — 업로드된 File 목록에서 파일명 추출", () => {
  it("JPG/RAW 확장자만 골라 basename을 추출한다", () => {
    const files = [
      new File([], "DSC_0001.jpg"),
      new File([], "DSC_0002.ARW"),
      new File([], "memo.txt"),
    ];
    expect(parseNamesFromFiles(files)).toEqual(new Set(["dsc_0001", "dsc_0002"]));
  });

  it("빈 목록이면 빈 Set", () => {
    expect(parseNamesFromFiles([])).toEqual(new Set());
  });
});

describe("SELECT_MATCH_RAW_EXTENSIONS", () => {
  it("주요 RAW 확장자를 포함한다", () => {
    for (const ext of ["arw", "cr2", "cr3", "nef", "dng"]) {
      expect(SELECT_MATCH_RAW_EXTENSIONS.has(ext)).toBe(true);
    }
  });
});
