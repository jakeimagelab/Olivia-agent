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

  it("결과를 쉼표로 구분한 한 줄로 만든다", () => {
    expect(formatFilenameBasenamesOneLine(["DSC_0142", "DSC_0145"])).toBe("DSC_0142, DSC_0145");
  });
});
