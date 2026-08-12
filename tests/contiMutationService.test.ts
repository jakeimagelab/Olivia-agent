import { describe, expect, it } from "vitest";
import { addContiShots, removeContiShot, reorderContiShot, resolveContiShot } from "@/lib/conti/contiMutationService";

const result = {
  conti: [
    { id: "a", category: "프로필", duration: "10분", location: "스튜디오", cameraAngle: "", keyword: "원장 프로필", description: "", personnel: "원장", notes: "" },
    { id: "b", category: "상담", duration: "15분", location: "상담실", cameraAngle: "", keyword: "상담컷", description: "", personnel: "", notes: "" },
  ],
  checklist: [], schedule: [],
};

describe("conti mutation service", () => {
  it("resolves selected IDs and legacy shot positions", () => {
    expect(resolveContiShot(result, { shotId: "b" })[0].index).toBe(1);
    expect(resolveContiShot(result, { shotId: "shot:2" })[0].shot.id).toBe("b");
  });

  it("adds the requested number after the selected shot", () => {
    const mutation = addContiShots(result, { count: 2, shotType: "상담", insertAfter: 0 });
    expect(mutation.created).toHaveLength(2);
    expect(mutation.result.conti).toHaveLength(4);
    expect(mutation.result.conti[1].category).toBe("상담");
  });

  it("persists reorder semantics through the shared result", () => {
    const mutation = reorderContiShot(result, 1, 0);
    expect(mutation.result.conti.map((shot) => shot.id)).toEqual(["b", "a"]);
  });

  it("removes one shot and preserves the others", () => {
    const mutation = removeContiShot(result, 1);
    expect(mutation.removed.id).toBe("b");
    expect(mutation.result.conti.map((shot) => shot.id)).toEqual(["a"]);
  });
});
