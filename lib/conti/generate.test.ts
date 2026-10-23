import { describe, expect, it } from "vitest";
import { generateContiDraft, type GenerateContiInput } from "./generate";
import { buildCodeSceneTemplates, CONTI_DEPARTMENT_LIST, getDepartmentContiTitle, getDepartmentDefinition, getDepartmentLabel, getSelectableContiCategories } from "./departmentTaxonomy";
import { deriveContiSchedule } from "./deriveSchedule";

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

  it("keeps mandatory opening scenes out of the ophthalmology choices", () => {
    expect(getDepartmentDefinition("ophthalmology")!.categories.map((category) => category.label)).toEqual(["상담실장 상담", "검사실(드림렌즈)", "수술 연출(그룹 협진)", "기타 진료(안성형/IPL)", "외관", "내부 공간컷"]);
    expect(getDepartmentDefinition("plastic-surgery")!.categories.map((category) => category.label)).toEqual(["얼굴성형", "가슴성형", "비만/체형", "기타"]);
  });

  it("hides automatically included personal scenes from department choices", () => {
    expect(getSelectableContiCategories("dermatology").map((category) => category.id)).not.toContain("doctor-consult");
    expect(getSelectableContiCategories("pain-medicine").map((category) => category.id)).not.toContain("doctor-consult");
  });

  it("uses one taxonomy label source for saved and imported conti titles", () => {
    expect(getDepartmentLabel("dentistry")).toBe("치과");
    expect(getDepartmentLabel("rehabilitation-medicine")).toBe("재활의학과");
    expect(getDepartmentLabel("neurosurgery")).toBe("신경외과");
    expect(getDepartmentLabel("pain-medicine")).toBe("마취통증의학과");
    expect(getDepartmentLabel("korean-medicine")).toBe("한방병원 / 한의원");
    expect(getDepartmentLabel("nursing-hospital")).toBe("요양병원");
    expect(getDepartmentContiTitle("dentistry")).toBe("치과 촬영 콘티");
    expect(getDepartmentContiTitle("imported")).toBe("가져온 촬영 콘티");
    expect(getDepartmentContiTitle("촬영")).toBe("촬영 콘티");
  });
});

describe("generateContiDraft", () => {
  it("keeps multiple procedures in one category scene", () => {
    const result = generate({ specialty: "dermatology", checked: { lifting: ["울쎄라", "써마지"] } });
    expect(result.scenes.filter((scene) => scene.name.includes("리프팅"))).toHaveLength(1);
    expect(result.scenes.find((scene) => scene.name.includes("리프팅"))?.procedures).toEqual(["울쎄라", "써마지"]);
    expect(result.scenes.some((scene) => scene.name.includes("울쎄라"))).toBe(false);
    expect(result.scenes.find((scene) => scene.name === "리프팅")?.description).toContain("촬영 세부: 울쎄라 · 써마지");
    expect(result.scenes.find((scene) => scene.name === "리프팅")?.preparationText).toContain("울쎄라, 써마지 관련");
  });

  it("stores one personal scene set instead of duplicating it per doctor", () => {
    const result = generate({
      specialty: "dermatology", doctorCount: 2,
      staffFlags: { siljang: true, jikwon: true, other: false }, harmony: true,
      personalOptions: { makeup: true, profile: true },
      checked: { lifting: ["울쎄라", "써마지"], "skin-booster": ["리쥬란"], pigmentation: ["피코"] },
    });
    expect(result.scenes.map((scene) => scene.name)).toEqual([
      "단체사진", "단체 하모니컷", "인포데스크 하모니컷", "접수/안내", "헤어메이크업 · 준비", "의료진 프로필", "진료 연출", "수술 연출", "리프팅", "스킨부스터", "색소",
      "실장 상담", "직원 업무", "로비 하모니컷",
    ]);
    expect(result.scenes.filter((scene) => scene.repeatScope === "per_doctor")).toHaveLength(4);
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
    expect(result.scenes.map((scene) => scene.name)).toEqual(["단체사진", "단체 하모니컷", "인포데스크 하모니컷", "진료 연출", "수술 연출", "보톡스", "코디네이터 촬영", "장비 단독컷"]);
  });

  it("creates fixed opening rows with the entered doctor count", () => {
    const doctors = Array.from({ length: 7 }, (_, index) => ({ id: `d${index + 1}`, name: `의료진 ${index + 1}`, surgeries: [], note: "", day: null }));
    const result = generate({ specialty: "ophthalmology", doctorCount: 9, doctors, checked: {} });
    expect(result.scenes.slice(0, 3).map((scene) => scene.name)).toEqual(["단체사진", "단체 하모니컷", "인포데스크 하모니컷"]);
    expect(result.scenes[0]).toMatchObject({ sceneCode: "S1", group: "단체", peopleText: "의료진 7명 / 실장 / 직원 2-3명", preparationText: "가운 7벌" });
    expect(result.scenes[1]).toMatchObject({ sceneCode: "S2", peopleText: "의료진 7명 전원", patientRoleText: "없음" });
    expect(result.scenes[2]).toMatchObject({ sceneCode: "S3", peopleText: "인포직원 2명, 환자그룹 2명", patientRoleText: "필요" });
  });

  it("adds hair makeup and profile only when selected", () => {
    const basic = generate({ specialty: "dermatology", checked: {} });
    expect(basic.scenes.map((scene) => scene.name)).not.toContain("헤어메이크업 · 준비");
    expect(basic.scenes.map((scene) => scene.name)).not.toContain("의료진 프로필");
    const selected = generate({ specialty: "dermatology", checked: {}, personalOptions: { makeup: true, profile: true } });
    expect(selected.scenes.map((scene) => scene.name)).toContain("헤어메이크업 · 준비");
    expect(selected.scenes.map((scene) => scene.name)).toContain("의료진 프로필");
  });

  it("keeps 15 ophthalmology timeline rows while optional personal scenes stay excluded", () => {
    const department = getDepartmentDefinition("ophthalmology")!;
    const doctors = Array.from({ length: 7 }, (_, index) => ({ id: `d${index + 1}`, name: `의료진 ${index + 1}`, surgeries: index === 0 ? ["cataract"] : ["lasik"], note: "", day: null }));
    const result = generate({ specialty: "ophthalmology", doctorCount: 7, doctors, checked: Object.fromEntries(department.categories.map((item) => [item.id, []])) });
    expect(result.scenes).toHaveLength(11);
    expect(result.scenes.filter((scene) => scene.repeatScope === "per_doctor")).toHaveLength(2);
    expect(result.scenes.filter((scene) => scene.name === "검사실(드림렌즈)")).toHaveLength(1);
    const schedule = deriveContiSchedule(result.scenes.map((scene) => ({ id: scene.id, sort: scene.sort, name: scene.name, minutes: scene.minutes, repeat_scope: scene.repeatScope, media: scene.media })), { doctors });
    expect(schedule).toHaveLength(15);
    expect(schedule.filter((row) => row.type === "doctor")).toHaveLength(7);
    expect(schedule.find((row) => row.type === "doctor")?.minutes).toBe(45);
  });
});
