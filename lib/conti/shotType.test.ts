import { describe, expect, it } from "vitest";
import { inferContiShotType, resolveContiShotType } from "./shotType";

describe("conti shot type", () => {
  it("infers the requested scene types from group and scene names", () => {
    expect(inferContiShotType({ name: "의료진 프로필" })).toBe("profile");
    expect(inferContiShotType({ groupName: "단체", name: "정면" })).toBe("group");
    expect(inferContiShotType({ name: "병원 외관" })).toBe("interior");
    expect(inferContiShotType({ name: "진료 연출" })).toBe("scene");
  });

  it("keeps an explicitly stored video type", () => {
    expect(resolveContiShotType({ shotType: "video", name: "진료 연출" })).toBe("video");
  });
});
