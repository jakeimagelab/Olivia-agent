import { describe, expect, it } from "vitest";
import { normalizeSelectionReportFileNames } from "@/lib/photo-operations/selectionReportFileNames";

describe("셀렉 리포트 OCR 파일명 정규화", () => {
  it("이미지에서 읽은 JPG 파일명을 NFC·대소문자 기준으로 중복 제거한다", () => {
    expect(normalizeSelectionReportFileNames([
      "R5K04439.JPG",
      " r5k04410.jpg ",
      "R5K04351.JPG",
      "r5k04439.jpg",
    ])).toEqual(["R5K04439.JPG", "r5k04410.jpg", "R5K04351.JPG"]);
  });

  it("RAW·경로·확장자 없는 문자열은 OCR 후보에서 제외한다", () => {
    expect(normalizeSelectionReportFileNames([
      "R5K04439.ARW",
      "folder/R5K04410.JPG",
      "R5K04351",
      "R5K04352.JPEG",
      42,
    ])).toEqual(["R5K04352.JPEG"]);
  });
});
