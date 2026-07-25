import { describe, expect, it } from "vitest";
import {
  calculateSelectionDiff,
  normalizeIdList,
  normalizeImageNotes,
  validatePhotoAnnotation,
} from "./gallery";

describe("PCRM gallery helpers", () => {
  it("선택 이미지 ID를 중복 없이 정리한다", () => {
    expect(normalizeIdList([" a ", "a", "", 3, "b"])).toEqual(["a", "b"]);
  });

  it("허용된 사진의 메모만 유지한다", () => {
    expect(normalizeImageNotes({ a: " 보정 요청 ", b: "숨김" }, new Set(["a"]))).toEqual({ a: "보정 요청" });
  });

  it("사진 좌표와 수정 내용을 검증한다", () => {
    expect(validatePhotoAnnotation({ imageId: "image", xRatio: 0.5, yRatio: 0.25, content: "피부 톤 정리" })).toEqual({
      ok: true,
      value: { imageId: "image", xRatio: 0.5, yRatio: 0.25, content: "피부 톤 정리" },
    });
    expect(validatePhotoAnnotation({ imageId: "image", xRatio: 1.2, yRatio: 0.25, content: "수정" }).ok).toBe(false);
  });

  it("재제출 시 추가·삭제·유지 선택을 계산한다", () => {
    expect(calculateSelectionDiff(["a", "b"], ["b", "c"])).toEqual({
      added: ["c"],
      removed: ["a"],
      unchanged: ["b"],
    });
  });
});
