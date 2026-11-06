import { describe, expect, it } from "vitest";

import { accessModeChangeProblem, assessAccessModeChange, isIndividualPersonSelectAccessAllowed, newPersonSelectProjectDefaults, normalizePersonSelectProjectSettings } from "@/lib/person-select/projectSettings";
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

  it("normalizes invalid values and allows an empty access-mode change", () => {
    expect(normalizePersonSelectProjectSettings({ project_type: "bad", access_mode: "bad", customer_view_mode: "bad" })).toEqual({
      projectType: "general",
      accessMode: "individual",
      customerViewMode: "classic",
    });
    expect(accessModeChangeProblem({ current: "individual", next: "project_shared", peopleCount: 0, choiceCount: 0, sharedSelectionCount: 0 })).toBeNull();
  });

  it("keeps 500 uploaded photos and permits the photos-only transition", () => {
    expect(assessAccessModeChange({
      current: "individual",
      next: "project_shared",
      peopleCount: 0,
      imageCount: 500,
      unassignedImageCount: 500,
    })).toEqual({ allowed: true, requiresConfirmation: false, warning: null });
  });

  it("requires confirmation for auto-created people and owned photos without customer activity", () => {
    const result = assessAccessModeChange({
      current: "individual",
      next: "project_shared",
      peopleCount: 22,
      imageCount: 2800,
      ownedImageCount: 2800,
      accessedPeopleCount: 0,
      choiceCount: 0,
      submittedPeopleCount: 0,
      orderPeopleCount: 0,
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.requiresConfirmation).toBe(true);
      expect(result.warning).toContain("공용 링크를 사용하는 모든 담당자");
    }
  });

  it("blocks individual activity with a precise reason and never treats it as shared data", () => {
    const result = assessAccessModeChange({
      current: "individual",
      next: "project_shared",
      peopleCount: 3,
      imageCount: 500,
      ownedImageCount: 500,
      accessedPeopleCount: 2,
      submittedPeopleCount: 1,
      choiceCount: 4,
      orderPeopleCount: 1,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("제출 완료한 참가자가 1명");
      expect(result.reason).toContain("개인별 선택·메모·보정 요청이 4건");
      expect(result.reason).toContain("추가 주문 내역이 있는 참가자가 1명");
      expect(result.reason).toContain("개인 링크에 접속한 참가자가 2명");
    }
  });

  it("requires complete ownership and PIN assignment for shared to individual", () => {
    expect(accessModeChangeProblem({
      current: "project_shared",
      next: "individual",
      peopleCount: 2,
      imageCount: 12,
      choiceCount: 0,
      sharedSelectionCount: 0,
      unassignedImageCount: 2,
    })).toContain("소유자가 지정되지 않은 사진이 2장");
    expect(accessModeChangeProblem({
      current: "project_shared",
      next: "individual",
      peopleCount: 2,
      imageCount: 12,
      choiceCount: 0,
      sharedSelectionCount: 0,
      ownersWithoutPinCount: 1,
    })).toContain("PIN이 없거나 유효하지 않은 사진 소유자가 1명");
    expect(accessModeChangeProblem({
      current: "project_shared",
      next: "individual",
      peopleCount: 2,
      imageCount: 12,
      choiceCount: 0,
      sharedSelectionCount: 0,
      unassignedImageCount: 0,
      ownersWithoutPinCount: 0,
      groupsWithoutEligiblePeopleCount: 0,
    })).toBeNull();
  });

  it("invalidates individual login and existing individual sessions in shared mode", () => {
    expect(isIndividualPersonSelectAccessAllowed("individual")).toBe(true);
    expect(isIndividualPersonSelectAccessAllowed("project_shared")).toBe(false);
  });
});
