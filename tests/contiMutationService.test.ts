import { describe, expect, it } from "vitest";
import { addContiShots, removeContiShot, reorderContiShot, resolveContiShot, updateContiShot } from "@/lib/conti/contiMutationService";

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

  it("adds structured items after the selected shot", () => {
    const mutation = addContiShots(result, {
      items: [
        { category: "상담", personnel: "최은주", location: "상담실" },
        { category: "상담", personnel: "배유진", location: "상담실" },
      ],
      insertAfter: 0,
    });
    expect(mutation.created).toHaveLength(2);
    expect(mutation.result.conti).toHaveLength(4);
    expect(mutation.result.conti[1].category).toBe("상담");
    expect(mutation.result.conti[1].personnel).toBe("최은주");
    expect(mutation.result.conti[2].personnel).toBe("배유진");
  });

  it("splits a pasted list of 6 people into 6 distinct shots, not one duplicated block", () => {
    const rawEntries = [
      { team: "상담팀", role: "총괄실장", name: "배유진", location: "3층 데스크" },
      { team: "상담팀", role: "팀장", name: "최은주", location: "3층 데스크" },
      { team: "총무팀", role: "팀장", name: "박미영", location: "7층 직원실" },
      { team: "중국cs", role: "팀장", name: "지니", location: "102호" },
      { team: "일본cs", role: "팀장", name: "박지은", location: "102호" },
      { team: "영어cs", role: "팀장", name: "조강현", location: "102호" },
    ];
    const items = rawEntries.map((entry) => ({
      category: entry.team,
      personnel: entry.name,
      location: entry.location,
      notes: entry.role,
    }));
    const mutation = addContiShots({ conti: [], checklist: [], schedule: [] }, { items });

    expect(mutation.created).toHaveLength(6);
    // Every shot must carry only its own person's data — none should contain the whole pasted block.
    mutation.created.forEach((shot, index) => {
      expect(shot.personnel).toBe(rawEntries[index].name);
      expect(shot.location).toBe(rawEntries[index].location);
      expect(shot.category).toBe(rawEntries[index].team);
      expect(shot.notes).toBe(rawEntries[index].role);
      expect(shot.description).not.toContain("\n");
    });
    // No two shots should be identical (the original bug produced 6 copies of the same block).
    const uniquePersonnel = new Set(mutation.created.map((shot) => shot.personnel));
    expect(uniquePersonnel.size).toBe(6);
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

  it("updates one shot while preserving untouched row references for memoized rendering", () => {
    const mutation = updateContiShot(result, 0, { description: "수정됨" });
    expect(mutation.result.conti[0]).not.toBe(result.conti[0]);
    expect(mutation.result.conti[1]).toBe(result.conti[1]);
  });
});
