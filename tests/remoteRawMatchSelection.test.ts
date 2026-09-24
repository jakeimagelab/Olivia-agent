import { describe, expect, it } from "vitest";
import { parseRemoteSelectedFileNames } from "@/lib/photo-operations/remoteRawMatch";

describe("원격 JPG 셀렉 파일명 검증", () => {
  it("JPG/JPEG 파일명만 보존하고 대소문자 중복을 제거한다", () => {
    expect(parseRemoteSelectedFileNames(["R5K0001.JPG", "r5k0001.jpg", "DSC0002.jpeg"]))
      .toEqual(["R5K0001.JPG", "DSC0002.jpeg"]);
  });

  it.each([
    [["../R5K0001.JPG"]],
    [["folder/R5K0001.JPG"]],
    [["R5K0001.ARW"]],
    [[]],
  ])("경로·RAW·빈 선택은 거부한다", (value) => {
    expect(() => parseRemoteSelectedFileNames(value)).toThrow();
  });
});
