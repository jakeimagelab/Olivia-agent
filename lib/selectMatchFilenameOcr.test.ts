import { describe, expect, it } from "vitest";
import { extractFilenameBasenamesFromOcr, formatFilenameBasenamesOneLine } from "./selectMatchFilenameOcr";

describe("select match filename OCR", () => {
  it("여러 확장자의 파일명에서 확장자를 제거한다", () => {
    expect(extractFilenameBasenamesFromOcr("DSC_0142.JPG\nDSC_0145.mp4\nA7C00123.ARW")).toEqual([
      "DSC_0142",
      "DSC_0145",
      "A7C00123",
    ]);
  });

  it("OCR이 점 주변에 넣은 공백을 보정하고 중복을 제거한다", () => {
    expect(extractFilenameBasenamesFromOcr("IMG_1001 . JPG IMG_1002.PNG\nimg_1001.jpg")).toEqual([
      "IMG_1001",
      "IMG_1002",
    ]);
  });

  it("셀렉 리포트 화면 안에 적힌 JPG 파일명을 각각 RAW 매칭용 basename으로 읽는다", () => {
    expect(extractFilenameBasenamesFromOcr([
      "연출",
      "R5K04439.JPG",
      "R5K04410.JPG",
      "R5K04351.JPG",
      "프로필",
      "R5K04471.JPG",
    ].join("\n"))).toEqual([
      "R5K04439",
      "R5K04410",
      "R5K04351",
      "R5K04471",
    ]);
  });

  it("결과를 쉼표로 구분한 한 줄로 만든다", () => {
    expect(formatFilenameBasenamesOneLine(["DSC_0142", "DSC_0145"])).toBe("DSC_0142, DSC_0145");
  });
});
