// 고정 진료과 taxonomy에서 결정론적으로 장면 골격을 만든다. AI를 호출하지 않는
// 순수 함수이며, 세부 시술은 procedures로만 보존하고 독립 Scene으로 만들지 않는다.
//
// DB 접근은 호출자(API route)가 담당한다 — 이 파일은 순수 로직이라 테스트하기 쉽다.

export type FieldSource = "template" | "hospital" | "ai" | "user" | "blank";
export type ContiRepeatScope = "once" | "per_doctor" | "per_doctor_pair";
export type ContiMedia = "photo" | "photo_video" | "none";

export interface ContiDoctorInput {
  id: string;
  name: string;
  surgeries: string[];
  note: string;
  day: string | null;
}

export interface SceneTemplateRow {
  id: string;
  specialty: string;
  category: string;
  scene_key: string;
  default_name: string;
  default_keyword: string;
  default_description: string;
  default_minutes: number | null;
  space_type: string;
  default_roles: string[];
  needs_patient: boolean;
  per_doctor: boolean;
  repeat_scope?: ContiRepeatScope;
  media?: ContiMedia;
  preparation_text?: string;
  default_note?: string;
  patient_role_text?: string;
}

export interface HospitalSpaceRow {
  id: string;
  name: string;
  space_type: string;
  floor: string;
}

export interface HospitalStaffRow {
  id: string;
  name: string;
  role: string;
}

export interface GenerateContiInput {
  specialty: string;
  doctorCount: number;
  doctors?: ContiDoctorInput[];
  staffFlags: { siljang: boolean; jikwon: boolean; other: boolean };
  otherStaffRole?: string;
  harmony: boolean;
  personalOptions?: { makeup?: boolean; profile?: boolean };
  // category id → 촬영할 세부 시술. key의 존재가 대분류 선택을 뜻한다.
  // 배열은 빈 값일 수 있으며, 배열 원소 수와 관계없이 대분류는 항상 Scene 하나다.
  checked: Record<string, string[]>;
  extraItems: string[];
}

export interface GenerateContiContext {
  templates: SceneTemplateRow[];
  hospitalSpaces: HospitalSpaceRow[];
  hospitalStaff: HospitalStaffRow[];
}

export interface DraftScene {
  id: string;
  sort: number;
  sceneCode: string;
  group: string;
  name: string;
  spaceText: string;
  minutes: number | null;
  keyword: string;
  description: string;
  procedures: string[];
  peopleText: string;
  patientRoleText: string;
  preparationText: string;
  note: string;
  templateId: string | null;
  repeatScope: ContiRepeatScope;
  media: ContiMedia;
  fieldSources: Record<
    "name" | "space_text" | "minutes" | "keyword" | "description" | "people_text" | "patient_role_text" | "preparation_text" | "note",
    FieldSource
  >;
}

export interface DraftGroup {
  name: string;
  sort: number;
}

export interface GenerateContiResult {
  groups: DraftGroup[];
  scenes: DraftScene[];
  spaceMatchStats: { matched: number; total: number };
}

const COMMON_SPECIALTY = "공통";
const HARMONY_SCENE_KEYS = ["harmony", "로비_하모니컷"];
const RECEPTION_SCENE_KEYS = ["reception", "인포데스크_접수컷"];
const STAFF_WORK_SCENE_KEYS = ["staff-work", "staff_work", "직원_업무"];
const CONSULT_SCENE_KEYS = ["doctor-consult", "consult", "진료실_상담컷"];
const PERSONAL_SCENE_KEYS = ["doctor-makeup", "doctor-profile", "doctor-consult", "doctor-surgery"];
export const MANDATORY_OPENING_SCENE_KEYS = ["group-photo", "group-harmony", "reception-harmony"] as const;
const SILJANG_SCENE_KEYS = ["manager-consult", "manager_consult", "실장_상담"];
const SURGERY_LABELS: Record<string, string> = {
  lasik: "라식·라섹", cataract: "백내장", retina: "망막", "eye-plastic": "안성형",
  "general-treatment": "일반치료", orthodontics: "교정", implant: "임플란트", "pediatric-dentistry": "소아치과",
  lifting: "리프팅", "skin-booster": "스킨부스터", pigmentation: "색소", acne: "여드름",
};

function textSource(value: string | null | undefined): FieldSource {
  return value && value.trim() ? "template" : "blank";
}

interface MatchedTemplate {
  template: SceneTemplateRow;
  procedures: string[];
}

// checked → 고정 taxonomy 템플릿 매칭. 과거 합성키도 읽되, 신규 입력은 category id를 쓴다.
function matchCheckedTemplates(input: GenerateContiInput, templates: SceneTemplateRow[]): MatchedTemplate[] {
  const matched: MatchedTemplate[] = [];
  for (const [key, items] of Object.entries(input.checked)) {
    const category = key.includes("::") ? key.slice(key.indexOf("::") + 2) : key;
    const template = templates.find((candidate) => candidate.specialty === input.specialty && candidate.category === category);
    if (template) matched.push({ template, procedures: Array.isArray(items) ? items : [] });
  }
  return matched;
}

function findCommon(templates: SceneTemplateRow[], sceneKeys: string[]): SceneTemplateRow | undefined {
  return templates.find((template) => template.specialty === COMMON_SPECIALTY && sceneKeys.includes(template.scene_key));
}

function buildDraftFromTemplate(template: SceneTemplateRow, procedures: string[], sort: number): DraftScene {
  const selectedProcedureText = procedures.length ? procedures.join(" · ") : "";
  const description = selectedProcedureText
    ? `${template.default_description}\n촬영 세부: ${selectedProcedureText}`
    : template.default_description;
  const preparationText = selectedProcedureText
    ? `${procedures.join(", ")} 관련 장비·소품과 촬영 동선 확인`
    : template.preparation_text ?? "";
  return {
    id: `scene-${sort}`,
    sort,
    sceneCode: `S${sort + 1}`,
    group: "미지정",
    name: template.default_name,
    spaceText: template.space_type,
    minutes: template.default_minutes,
    keyword: template.default_keyword,
    description,
    procedures,
    peopleText: "",
    patientRoleText: template.patient_role_text ?? (template.needs_patient ? "환자" : ""),
    preparationText,
    note: template.default_note ?? "",
    templateId: template.id,
    repeatScope: template.repeat_scope ?? (template.per_doctor ? "per_doctor" : "once"),
    media: template.media ?? "photo",
    fieldSources: {
      name: textSource(template.default_name),
      space_text: textSource(template.space_type),
      minutes: template.default_minutes != null ? "template" : "blank",
      keyword: textSource(template.default_keyword),
      description: textSource(description),
      people_text: "blank",
      patient_role_text: textSource(template.patient_role_text ?? (template.needs_patient ? "환자" : "")),
      preparation_text: textSource(preparationText),
      note: textSource(template.default_note),
    },
  };
}

function templateSceneKey(scene: DraftScene): string {
  return scene.templateId?.split(":").at(-1) ?? "";
}

export function isMandatoryOpeningScene(scene: Pick<DraftScene, "templateId">): boolean {
  const sceneKey = scene.templateId?.split(":").at(-1) ?? "";
  return MANDATORY_OPENING_SCENE_KEYS.some((key) => key === sceneKey);
}

function applyMandatoryOpeningContent(scene: DraftScene, doctorCount: number): DraftScene {
  const sceneKey = templateSceneKey(scene);
  const common = {
    ...scene,
    group: "단체",
    minutes: 15,
    media: "photo" as ContiMedia,
    repeatScope: "once" as ContiRepeatScope,
    fieldSources: {
      ...scene.fieldSources,
      name: "template" as FieldSource,
      space_text: "template" as FieldSource,
      minutes: "template" as FieldSource,
      keyword: "template" as FieldSource,
      description: "template" as FieldSource,
      people_text: "template" as FieldSource,
      patient_role_text: "template" as FieldSource,
    },
  };
  if (sceneKey === "group-photo") {
    return {
      ...common,
      name: "단체사진",
      spaceText: "로비",
      keyword: "신뢰 · 전문",
      description: `의료진 ${doctorCount}명 일렬 또는 2열 정렬. 정면 아이컨택.\n- 병원의 느낌을 보여주는 것으로 가장 중요합니다\n- 가운 색·길이를 통일한 뒤 촬영\n- 홈페이지 메인 후보`,
      peopleText: `의료진 ${doctorCount}명 / 실장 / 직원 2-3명`,
      patientRoleText: "2명 권장",
      preparationText: `가운 ${doctorCount}벌`,
      fieldSources: { ...common.fieldSources, preparation_text: "template" },
    };
  }
  if (sceneKey === "group-harmony") {
    return {
      ...common,
      name: "단체 하모니컷",
      spaceText: "로비 · 복도",
      keyword: "역동 · 호흡",
      description: "의료진, 간호사, 직원이 함께 웃는 모습\n- 병원의 느낌을 보여주는 것으로 가장 중요합니다.",
      peopleText: `의료진 ${doctorCount}명 전원`,
      patientRoleText: "없음",
      preparationText: "",
      fieldSources: { ...common.fieldSources, preparation_text: "blank" },
    };
  }
  if (sceneKey === "reception-harmony") {
    const participatingDoctors = Math.min(doctorCount, 2);
    return {
      ...common,
      name: "인포데스크 하모니컷",
      spaceText: "로비",
      keyword: "따뜻한 병원",
      description: `실제 접수하는 모습 촬영하되, 필요시 의료진도 함께 연출\n- 환자그룹 2명, 모든 접수물 화면에서 안내를 받고\n- 여기에 의료진 ${participatingDoctors}명이 함께 미소를 짓는 모습`,
      peopleText: "인포직원 2명, 환자그룹 2명",
      patientRoleText: "필요",
      preparationText: "",
      fieldSources: { ...common.fieldSources, preparation_text: "blank" },
    };
  }
  return scene;
}

// 4) space_type ↔ hospital_spaces 매칭 + 층 그룹 배정
function assignSpaceAndGroup(
  scene: DraftScene,
  template: SceneTemplateRow | undefined,
  spaces: HospitalSpaceRow[]
): { scene: DraftScene; matched: boolean } {
  const spaceType = template?.space_type?.trim();
  const spaceMatch = spaceType ? spaces.find((s) => s.space_type.trim() === spaceType) : undefined;

  if (!spaceMatch) {
    return { scene: { ...scene, group: scene.spaceText || "미지정" }, matched: false };
  }

  return {
    scene: {
      ...scene,
      spaceText: spaceMatch.name,
      group: spaceMatch.floor?.trim() || "공통",
      fieldSources: { ...scene.fieldSources, space_text: "hospital" },
    },
    matched: true,
  };
}

// 6) default_roles + hospital_staff → people_text
function assignPeople(scene: DraftScene, template: SceneTemplateRow | undefined, staff: HospitalStaffRow[]): DraftScene {
  const roles = template?.default_roles ?? [];
  if (roles.length === 0) {
    return { ...scene, peopleText: "", fieldSources: { ...scene.fieldSources, people_text: "blank" } };
  }

  let allMatched = true;
  const labels = roles.map((role) => {
    const staffMember = staff.find((s) => s.role.trim() === role.trim());
    if (staffMember) return staffMember.name;
    allMatched = false;
    return role;
  });

  return {
    ...scene,
    peopleText: labels.join(", "),
    fieldSources: { ...scene.fieldSources, people_text: allMatched ? "hospital" : "ai" },
  };
}

function buildCustomScene(name: string, sort: number, role?: string): DraftScene {
  const peopleText = role?.trim() || "";
  return {
    id: `scene-${sort}`,
    sort,
    sceneCode: `S${sort + 1}`,
    group: "미지정",
    name,
    spaceText: "병원 내부",
    minutes: 10,
    keyword: "자연스러운 업무 / 병원 분위기",
    description: `${name} 장면을 촬영 목적에 맞게 자연스럽게 연출`,
    procedures: [],
    peopleText,
    patientRoleText: "",
    preparationText: "촬영 장소와 참여 인원, 필요한 소품 확인",
    note: "",
    templateId: null,
    repeatScope: "once",
    media: "photo",
    fieldSources: {
      name: "user", space_text: "ai", minutes: "ai", keyword: "ai", description: "ai",
      people_text: peopleText ? "user" : "blank", patient_role_text: "blank",
      preparation_text: "ai", note: "blank",
    },
  };
}

export function generateContiDraft(input: GenerateContiInput, ctx: GenerateContiContext): GenerateContiResult {
  const relevantSpecialties = new Set([input.specialty, COMMON_SPECIALTY]);
  const templates = ctx.templates.filter((t) => relevantSpecialties.has(t.specialty));
  const templateById = new Map(ctx.templates.map((t) => [t.id, t]));

  const selected = matchCheckedTemplates(input, templates);
  const shared = selected.filter((item) => !PERSONAL_SCENE_KEYS.includes(item.template.scene_key));

  let sortCounter = 0;
  let scenes: DraftScene[] = [];
  const pushTemplate = (template: SceneTemplateRow | undefined, procedures: string[] = []) => {
    if (!template) return;
    scenes.push(buildDraftFromTemplate(template, procedures, sortCounter++));
  };

  const enteredDoctorCount = Math.max(1, (input.doctors ?? []).filter((doctor) => doctor.name.trim()).length || input.doctorCount || 1);

  for (const sceneKey of MANDATORY_OPENING_SCENE_KEYS) {
    pushTemplate(findCommon(templates, [sceneKey]));
  }

  if (input.staffFlags.jikwon) {
    pushTemplate(findCommon(templates, RECEPTION_SCENE_KEYS));
  }

  const selectedPersonalSceneKeys = [
    ...(input.personalOptions?.makeup ? ["doctor-makeup"] : []),
    ...(input.personalOptions?.profile ? ["doctor-profile"] : []),
    "doctor-consult",
    "doctor-surgery",
  ];
  for (const sceneKey of selectedPersonalSceneKeys) {
    pushTemplate(findCommon(templates, sceneKey === "doctor-consult" ? CONSULT_SCENE_KEYS : [sceneKey]));
  }

  for (const item of shared) pushTemplate(item.template, item.procedures);

  const hasSelectedManagerConsult = shared.some((item) => item.template.scene_key === "manager-consult");
  if (input.staffFlags.siljang && !hasSelectedManagerConsult) pushTemplate(findCommon(templates, SILJANG_SCENE_KEYS));
  if (input.staffFlags.jikwon) pushTemplate(findCommon(templates, STAFF_WORK_SCENE_KEYS));

  const extraRole = input.staffFlags.other ? input.otherStaffRole?.trim() : "";
  if (extraRole) scenes.push(buildCustomScene(`${extraRole} 촬영`, sortCounter++, extraRole));
  for (const customItem of input.extraItems) {
    const value = customItem.trim();
    if (value) scenes.push(buildCustomScene(value, sortCounter++));
  }

  if (input.harmony) pushTemplate(findCommon(templates, HARMONY_SCENE_KEYS));

  // 같은 자동 장면과 진료과 장면이 겹쳐도 한 벌만 남긴다. 세부 선택은 합쳐 보존한다.
  const deduplicated = new Map<string, DraftScene>();
  for (const scene of scenes) {
    const key = templateSceneKey(scene) || scene.name.trim().replace(/\s+/g, " ");
    const previous = deduplicated.get(key);
    if (!previous) {
      deduplicated.set(key, scene);
      continue;
    }
    deduplicated.set(key, {
      ...previous,
      procedures: [...new Set([...previous.procedures, ...scene.procedures])],
    });
  }
  scenes = [...deduplicated.values()];

  let spaceMatchedCount = 0;
  scenes = scenes.map((scene) => {
    const template = scene.templateId ? templateById.get(scene.templateId) : undefined;
    const { scene: withSpace, matched: didMatch } = assignSpaceAndGroup(scene, template, ctx.hospitalSpaces);
    if (didMatch) spaceMatchedCount += 1;
    return applyMandatoryOpeningContent(assignPeople(withSpace, template, ctx.hospitalStaff), enteredDoctorCount);
  });

  // 생성 순서는 의료진별 촬영 흐름을 보존한다. 그룹은 결과 표의 시각적 구분에만 쓴다.
  const groupOrder: string[] = [];
  for (const scene of scenes) {
    if (!groupOrder.includes(scene.group)) groupOrder.push(scene.group);
  }

  const doctorAssignments = (input.doctors ?? [])
    .filter((doctor) => doctor.name.trim())
    .map((doctor) => `${doctor.name.trim()} ${doctor.surgeries.map((value) => value.startsWith("custom:") ? value.slice(7) : SURGERY_LABELS[value] ?? value).join("·")}`.trim())
    .filter(Boolean)
    .join(" · ");
  const orderedScenes = scenes.map((scene, index) => ({
    ...scene,
    sort: index,
    sceneCode: `S${index + 1}`,
    ...(scene.templateId?.endsWith(":doctor-surgery") && doctorAssignments
      ? { preparationText: doctorAssignments, fieldSources: { ...scene.fieldSources, preparation_text: "user" as FieldSource } }
      : {}),
  }));

  const groups: DraftGroup[] = groupOrder.map((name, index) => ({ name, sort: index }));

  return {
    groups,
    scenes: orderedScenes,
    spaceMatchStats: { matched: spaceMatchedCount, total: orderedScenes.length },
  };
}
