// 고정 진료과 taxonomy에서 결정론적으로 장면 골격을 만든다. AI를 호출하지 않는
// 순수 함수이며, 세부 시술은 procedures로만 보존하고 독립 Scene으로 만들지 않는다.
//
// DB 접근은 호출자(API route)가 담당한다 — 이 파일은 순수 로직이라 테스트하기 쉽다.

export type FieldSource = "template" | "hospital" | "ai" | "user" | "blank";

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
  staffFlags: { siljang: boolean; jikwon: boolean; other: boolean };
  otherStaffRole?: string;
  harmony: boolean;
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
const SILJANG_SCENE_KEYS = ["manager-consult", "manager_consult", "실장_상담"];

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

function buildDraftFromTemplate(template: SceneTemplateRow, procedures: string[], sort: number, nameSuffix: string): DraftScene {
  const baseName = template.default_name.replace(/^진료실\s*/, "").replace(/^원장\s*/, "").replace(/컷$/, "").trim();
  const name = nameSuffix ? `${nameSuffix} ${baseName}` : template.default_name;
  return {
    id: `scene-${sort}`,
    sort,
    group: "미지정",
    name,
    spaceText: template.space_type,
    minutes: template.default_minutes,
    keyword: template.default_keyword,
    description: template.default_description,
    procedures,
    peopleText: "",
    patientRoleText: template.patient_role_text ?? (template.needs_patient ? "환자" : ""),
    preparationText: template.preparation_text ?? "",
    note: template.default_note ?? "",
    templateId: template.id,
    fieldSources: {
      name: textSource(template.default_name),
      space_text: textSource(template.space_type),
      minutes: template.default_minutes != null ? "template" : "blank",
      keyword: textSource(template.default_keyword),
      description: textSource(template.default_description),
      people_text: "blank",
      patient_role_text: textSource(template.patient_role_text ?? (template.needs_patient ? "환자" : "")),
      preparation_text: textSource(template.preparation_text),
      note: textSource(template.default_note),
    },
  };
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
  const doctorMatch = scene.name.match(/^원장(\d+)\s/);
  const labels = roles.map((role) => {
    if (role === "원장" && doctorMatch) {
      const index = Number(doctorMatch[1]) - 1;
      const doctors = staff.filter((member) => member.role.trim().includes("원장"));
      return doctors[index]?.name ?? `원장${index + 1}`;
    }
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
  const perDoctor = selected.filter((item) => item.template.per_doctor);
  const shared = selected.filter((item) => !item.template.per_doctor);

  let sortCounter = 0;
  let scenes: DraftScene[] = [];
  const pushTemplate = (template: SceneTemplateRow | undefined, procedures: string[] = [], suffix = "") => {
    if (!template) return;
    scenes.push(buildDraftFromTemplate(template, procedures, sortCounter++, suffix));
  };

  if (input.staffFlags.jikwon) {
    pushTemplate(findCommon(templates, RECEPTION_SCENE_KEYS));
  }

  const hasSelectedDoctorConsult = perDoctor.some((item) => item.template.scene_key === "doctor-consult");
  const consult = hasSelectedDoctorConsult ? undefined : findCommon(templates, CONSULT_SCENE_KEYS);
  const doctorCount = Math.max(1, input.doctorCount);
  for (let doctorIndex = 0; doctorIndex < doctorCount; doctorIndex += 1) {
    const suffix = doctorCount > 1 ? `원장${doctorIndex + 1}` : "";
    pushTemplate(consult, [], suffix);
    for (const item of perDoctor) pushTemplate(item.template, item.procedures, suffix);
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

  let spaceMatchedCount = 0;
  scenes = scenes.map((scene) => {
    const template = scene.templateId ? templateById.get(scene.templateId) : undefined;
    const { scene: withSpace, matched: didMatch } = assignSpaceAndGroup(scene, template, ctx.hospitalSpaces);
    if (didMatch) spaceMatchedCount += 1;
    return assignPeople(withSpace, template, ctx.hospitalStaff);
  });

  // 생성 순서는 의료진별 촬영 흐름을 보존한다. 그룹은 결과 표의 시각적 구분에만 쓴다.
  const groupOrder: string[] = [];
  for (const scene of scenes) {
    if (!groupOrder.includes(scene.group)) groupOrder.push(scene.group);
  }

  const orderedScenes = scenes.map((scene, index) => ({ ...scene, sort: index }));

  const groups: DraftGroup[] = groupOrder.map((name, index) => ({ name, sort: index }));

  return {
    groups,
    scenes: orderedScenes,
    spaceMatchStats: { matched: spaceMatchedCount, total: orderedScenes.length },
  };
}
