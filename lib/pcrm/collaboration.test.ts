import { describe, expect, it } from "vitest";
import {
  canTransitionPublication,
  getPcrmSceneKey,
  hasPreparationValue,
  validateShortText,
} from "./collaboration";

describe("PCRM 협업 공통 로직", () => {
  it("공개 또는 열람 상태만 승인할 수 있다", () => {
    expect(canTransitionPublication("published", "approve")).toBe(true);
    expect(canTransitionPublication("viewed", "approve")).toBe(true);
    expect(canTransitionPublication("approved", "approve")).toBe(false);
  });

  it("빈 촬영 준비 값은 제출 값으로 보지 않는다", () => {
    expect(hasPreparationValue({ value: "  " })).toBe(false);
    expect(hasPreparationValue({ value: "주차 가능" })).toBe(true);
  });

  it("같은 장면은 같은 식별 키를 만든다", () => {
    const scene = { title: "진료 장면", description: "상담하는 모습" };
    expect(getPcrmSceneKey(scene, 1)).toBe(getPcrmSceneKey(scene, 1));
    expect(getPcrmSceneKey({ id: "scene-a" }, 0)).toBe("scene-a");
  });

  it("문의 제목 길이를 검증한다", () => {
    expect(validateShortText("", "제목", 200).ok).toBe(false);
    expect(validateShortText("문의", "제목", 200)).toEqual({ ok: true, value: "문의" });
  });
});
