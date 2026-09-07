import { describe, expect, it } from "vitest";
import { generateContiDraft, type GenerateContiInput } from "./generate";
import { buildCodeSceneTemplates, CONTI_DEPARTMENT_LIST, getDepartmentDefinition } from "./departmentTaxonomy";

function generate(input: Partial<GenerateContiInput> & Pick<GenerateContiInput, "specialty" | "checked">) {
  const fullInput: GenerateContiInput = {
    doctorCount: 1,
    staffFlags: { siljang: false, jikwon: false, other: false },
    harmony: false,
    extraItems: [],
    ...input,
  };
  return generateContiDraft(fullInput, { templates: buildCodeSceneTemplates(fullInput.specialty), hospitalSpaces: [], hospitalStaff: [] });
}

describe("department taxonomy", () => {
  it("provides all requested departments from code", () => {
    expect(CONTI_DEPARTMENT_LIST).toHaveLength(12);
    for (const department of CONTI_DEPARTMENT_LIST) expect(getDepartmentDefinition(department.id)?.categories.length).toBeGreaterThan(0);
  });

  it("contains no obstetrics items in gynecology", () => {
    const text = JSON.stringify(getDepartmentDefinition("gynecology"));
    for (const forbidden of ["임신", "임산부", "출산", "분만", "분만실", "신생아", "산전", "산후"]) expect(text).not.toContain(forbidden);
  });

  it("uses the exact orthopedics categories without legacy items", () => {
    const department = getDepartmentDefinition("orthopedics")!;
    expect(department.categories.map((category) => category.label)).toEqual(["원장 진료/상담", "X-ray", "근골격 초음파", "C-ARM", "주사치료", "체외충격파", "도수치료", "물리치료", "운동치료", "실장/직원 상담"]);
    const labels = department.categories.map((category) => category.label);
    for (const forbidden of ["신경계 재활", "수술 후 재활", "척추", "관절", "통증클리닉", "MRI 판독"]) expect(labels).not.toContain(forbidden);
  });

  it("uses the exact ophthalmology and plastic-surgery category sets", () => {
    expect(getDepartmentDefinition("ophthalmology")!.categories.map((category) => category.label)).toEqual(["검사실", "실장상담", "의료진 상담 및 진료", "라식/라섹", "백내장", "기타수술", "소아·드림렌즈", "안성형"]);
    expect(getDepartmentDefinition("plastic-surgery")!.categories.map((category) => category.label)).toEqual(["얼굴성형", "가슴성형", "비만/체형", "기타"]);
  });
});

describe("generateContiDraft", () => {
  it("keeps multiple procedures in one category scene", () => {
    const result = generate({ specialty: "dermatology", checked: { lifting: ["울쎄라", "써마지"] } });
    expect(result.scenes.filter((scene) => scene.name.includes("리프팅"))).toHaveLength(1);
    expect(result.scenes.find((scene) => scene.name.includes("리프팅"))?.procedures).toEqual(["울쎄라", "써마지"]);
    expect(result.scenes.some((scene) => scene.name.includes("울쎄라"))).toBe(false);
  });

  it("creates the expected two-doctor dermatology flow", () => {
    const result = generate({
      specialty: "dermatology", doctorCount: 2,
      staffFlags: { siljang: true, jikwon: true, other: false }, harmony: true,
      checked: { lifting: ["울쎄라", "써마지"], "skin-booster": ["리쥬란"], pigmentation: ["피코"] },
    });
    expect(result.scenes.map((scene) => scene.name)).toEqual([
      "접수/안내", "원장1 상담", "원장1 리프팅", "원장1 스킨부스터", "원장1 색소",
      "원장2 상담", "원장2 리프팅", "원장2 스킨부스터", "원장2 색소",
      "실장 상담", "직원 업무", "로비 하모니컷",
    ]);
  });

  it("does not duplicate shared categories by doctor count", () => {
    const result = generate({ specialty: "dermatology", doctorCount: 2, checked: { "skin-diagnosis": ["피부분석기"], aesthetic: ["LDM"] } });
    expect(result.scenes.filter((scene) => scene.name === "피부진단")).toHaveLength(1);
    expect(result.scenes.filter((scene) => scene.name === "에스테틱")).toHaveLength(1);
  });

  it("does not add a second manager consult when the category and staff flag overlap", () => {
    const result = generate({ specialty: "dermatology", checked: { "manager-consult": [] }, staffFlags: { siljang: true, jikwon: false, other: false } });
    expect(result.scenes.filter((scene) => scene.name === "실장상담" || scene.name === "실장 상담")).toHaveLength(1);
  });

  it("supports category-only selection, custom staff, and extra items", () => {
    const result = generate({ specialty: "dermatology", checked: { botox: [] }, staffFlags: { siljang: false, jikwon: false, other: true }, otherStaffRole: "코디네이터", extraItems: ["장비 단독컷"] });
    expect(result.scenes.map((scene) => scene.name)).toEqual(["원장 상담", "보톡스", "코디네이터 촬영", "장비 단독컷"]);
  });
});
