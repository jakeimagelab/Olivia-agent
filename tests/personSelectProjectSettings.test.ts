import { describe, expect, it } from "vitest";

import { accessModeChangeProblem, newPersonSelectProjectDefaults, normalizePersonSelectProjectSettings } from "@/lib/person-select/projectSettings";
import { categoriesForProjectType } from "@/lib/person-select/types";

describe("person-select project settings", () => {
  it("starts a general project with neutral settings instead of school or Bellavita products", () => {
    const defaults = newPersonSelectProjectDefaults("general");
    expect(defaults.categories).toEqual([{ key: "photo", label: "사진", pick: 1 }]);
    expect(defaults.offer_notice).toBe("");
    expect(defaults.extra_price).toBe(0);
    expect(defaults.extra_max).toBe(0);
    expect(defaults.offers).toEqual([]);
  });

  it("copies project-type recommendations so one project cannot mutate another", () => {
    const first = categoriesForProjectType("medical");
    const second = categoriesForProjectType("medical");
    first[0].label = "변경";
    expect(second.map((category) => category.label)).toEqual(["프로필", "진료 연출", "단체사진"]);
    expect(categoriesForProjectType("business").map((category) => category.label)).toEqual(["프로필", "단체사진"]);
  });

  it("normalizes invalid values and blocks access-mode changes after customer data exists", () => {
    expect(normalizePersonSelectProjectSettings({ project_type: "bad", access_mode: "bad", customer_view_mode: "bad" })).toEqual({
      projectType: "general",
      accessMode: "individual",
      customerViewMode: "classic",
    });
    expect(accessModeChangeProblem({ current: "individual", next: "project_shared", peopleCount: 1, choiceCount: 0, sharedSelectionCount: 0 })).toContain("바꿀 수 없습니다");
    expect(accessModeChangeProblem({ current: "individual", next: "project_shared", peopleCount: 0, choiceCount: 0, sharedSelectionCount: 0 })).toBeNull();
  });
});
