import { describe, expect, it } from "vitest";
import { planPersonLoginNameUpdates } from "@/lib/person-select/loginNames";

describe("person select login name cleanup", () => {
  it("changes generated role-bearing names without touching custom login names", () => {
    const plan = planPersonLoginNameUpdates([
      { id: "a", display_name: "김정현과장님", login_name: "김정현과장님" },
      { id: "b", display_name: "김하영부장님", login_name: "하영" },
      { id: "c", display_name: "유지나대표님", login_name: "유지나" },
    ]);
    expect(plan.updates).toEqual([{ id: "a", displayName: "김정현과장님", currentLoginName: "김정현과장님", nextLoginName: "김정현" }]);
    expect(plan.skippedCustom).toEqual([{ id: "b", displayName: "김하영부장님", currentLoginName: "하영", nextLoginName: "김하영" }]);
    expect(plan.conflicts).toEqual([]);
  });

  it("blocks the whole cleanup when role removal creates a duplicate login name", () => {
    const plan = planPersonLoginNameUpdates([
      { id: "a", display_name: "김정현과장님", login_name: "김정현과장님" },
      { id: "b", display_name: "김정현부장님", login_name: "김정현부장님" },
    ]);
    expect(plan.updates).toHaveLength(2);
    expect(plan.conflicts).toEqual([{ loginName: "김정현", people: [{ id: "a", displayName: "김정현과장님" }, { id: "b", displayName: "김정현부장님" }] }]);
  });
});
