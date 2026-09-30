import { describe, expect, it } from "vitest";
import { isTcutCandidate, tcutReasons } from "@/lib/photoTcut/analysis";

const allChecks = { eyesClosed: true, blur: true, faceUnreadableLighting: true };

describe("T컷 후보 규칙", () => {
  it("눈 감음, 흔들림, 얼굴 식별 불가 조명만 후보로 만든다", () => {
    expect(tcutReasons({ blurScore: 12 }, { eyesClosed: true, faceUnreadableLighting: true, lightingReason: "얼굴 노출 부족" }, allChecks))
      .toEqual(["eyes_closed", "blur", "face_unreadable_lighting"]);
  });

  it("조금 어두운 사진을 평균 밝기만으로 T컷 처리하지 않는다", () => {
    const reasons = tcutReasons({ blurScore: 40 }, { eyesClosed: false, faceUnreadableLighting: false, lightingReason: null }, allChecks);
    expect(reasons).toEqual([]);
    expect(isTcutCandidate(reasons)).toBe(false);
  });

  it("사용자가 끈 검사 항목은 후보에 넣지 않는다", () => {
    expect(tcutReasons({ blurScore: 10 }, { eyesClosed: true, faceUnreadableLighting: true, lightingReason: "얼굴 식별 불가" }, {
      eyesClosed: false,
      blur: true,
      faceUnreadableLighting: false,
    })).toEqual(["blur"]);
  });
});
