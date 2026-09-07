// 3단계 — 콘티 생성 로직. checked 체크항목을 scene_templates에 결정론적으로 매칭해
// 장면 초안을 만든다. AI를 호출하지 않는 순수 함수다 — 판단할 수 없는 칸은 전부
// field_sources: "blank"로 남긴다. (설명/키워드가 비어 있는 템플릿에 AI로 문장을
// 채우는 건 이후 단계에서 이 결과 위에 얹는 별도 패스로 처리한다.)
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
  specialties: string[];
  doctorCount: number;
  staffFlags: { siljang?: boolean; jikwon?: boolean };
  harmony: boolean;
  // "진료과::대분류" 합성키 → 체크된 세부 항목. 카테고리 이름("기본 장면" 등)이 여러
  // 진료과에서 반복되므로 진료과를 키에 포함한다. scene_templates.category에 템플릿이
  // 하나뿐이면 "부모 장면 + 세부 시술 태그" 패턴(리프팅 → [울쎄라, 써마지]), 여러 개면
  // "카테고리 안에서 개별 장면 선택" 패턴(default_name/scene_key로 매칭)으로 처리한다.
  checked: Record<string, string[]>;
}

export interface GenerateContiContext {
  templates: SceneTemplateRow[];
  hospitalSpaces: HospitalSpaceRow[];
  hospitalStaff: HospitalStaffRow[];
}

export interface DraftScene {
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
  note: string;
  templateId: string | null;
  fieldSources: Record<
    "name" | "space_text" | "minutes" | "keyword" | "description" | "people_text" | "patient_role_text" | "note",
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
// sceneTemplateSeed.ts의 COMMON_SCENES 이름과 반드시 일치해야 한다 (toSceneKey 결과).
const HARMONY_SCENE_KEY = "로비_하모니컷";
const RECEPTION_SCENE_KEY = "인포데스크_접수컷";
const CONSULT_SCENE_KEY = "진료실_상담컷";
const SILJANG_SCENE_KEY = "실장_상담";

function textSource(value: string | null | undefined): FieldSource {
  return value && value.trim() ? "template" : "blank";
}

interface MatchedTemplate {
  template: SceneTemplateRow;
  procedures: string[];
}

// checked 키 파서 — "진료과::카테고리" 합성키를 기대한다. 같은 카테고리 이름("기본 장면" 등)이
// 여러 진료과에서 반복되므로, 순수 카테고리 키만 쓰면 서로 다른 진료과의 체크 목록이 뒤섞인다.
// 과거 형식(카테고리만)도 방어적으로 지원 — "::"가 없으면 전체 진료과에 대해 매칭을 시도한다.
function parseCheckedKey(key: string): { specialty: string | null; category: string } {
  const idx = key.indexOf("::");
  if (idx === -1) return { specialty: null, category: key };
  return { specialty: key.slice(0, idx), category: key.slice(idx + 2) };
}

// 1) checked → scene_templates 매칭
function matchCheckedTemplates(input: GenerateContiInput, templates: SceneTemplateRow[]): MatchedTemplate[] {
  const matched: MatchedTemplate[] = [];
  for (const [key, items] of Object.entries(input.checked)) {
    if (!items || items.length === 0) continue;
    const { specialty: keySpecialty, category } = parseCheckedKey(key);
    const targetSpecialties = keySpecialty ? [keySpecialty] : input.specialties;
    for (const specialty of targetSpecialties) {
      const candidates = templates.filter((t) => t.specialty === specialty && t.category === category);
      if (candidates.length === 0) continue;
      if (candidates.length === 1) {
        matched.push({ template: candidates[0], procedures: items });
      } else {
        for (const itemName of items) {
          const found = candidates.find((c) => c.default_name === itemName || c.scene_key === itemName);
          if (found) matched.push({ template: found, procedures: [] });
        }
      }
    }
  }
  return matched;
}

// 3) 공통 장면 추가 (실장/직원/하모니 체크 + 상담컷은 항상 기본 포함)
function addCommonTemplates(input: GenerateContiInput, templates: SceneTemplateRow[], matched: MatchedTemplate[]) {
  const findCommon = (sceneKey: string) =>
    templates.find((t) => t.specialty === COMMON_SPECIALTY && t.scene_key === sceneKey);

  if (input.harmony) {
    const t = findCommon(HARMONY_SCENE_KEY);
    if (t) matched.unshift({ template: t, procedures: [] });
  }
  const consult = findCommon(CONSULT_SCENE_KEY);
  if (consult) matched.push({ template: consult, procedures: [] });
  if (input.staffFlags.jikwon) {
    const t = findCommon(RECEPTION_SCENE_KEY);
    if (t) matched.push({ template: t, procedures: [] });
  }
  if (input.staffFlags.siljang) {
    const t = findCommon(SILJANG_SCENE_KEY);
    if (t) matched.push({ template: t, procedures: [] });
  }
}

function buildDraftFromTemplate(template: SceneTemplateRow, procedures: string[], sort: number, nameSuffix: string): DraftScene {
  const name = nameSuffix ? `${template.default_name} ${nameSuffix}` : template.default_name;
  return {
    sort,
    group: "미지정",
    name,
    spaceText: "",
    minutes: template.default_minutes,
    keyword: template.default_keyword,
    description: template.default_description,
    procedures,
    peopleText: "",
    patientRoleText: "",
    note: "",
    templateId: template.id,
    fieldSources: {
      name: textSource(template.default_name),
      space_text: "blank",
      minutes: template.default_minutes != null ? "template" : "blank",
      keyword: textSource(template.default_keyword),
      description: textSource(template.default_description),
      people_text: "blank",
      patient_role_text: "blank",
      note: "blank",
    },
  };
}

// 2) per_doctor 복제
function expandPerDoctor(matchedItem: MatchedTemplate, doctorCount: number, sortStart: number): DraftScene[] {
  const { template, procedures } = matchedItem;
  if (!template.per_doctor || doctorCount <= 1) {
    return [buildDraftFromTemplate(template, procedures, sortStart, "")];
  }
  const count = Math.max(1, doctorCount);
  return Array.from({ length: count }, (_, i) =>
    buildDraftFromTemplate(template, procedures, sortStart + i, `(원장 ${i + 1})`)
  );
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
    return { scene: { ...scene, group: "미지정" }, matched: false };
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

export function generateContiDraft(input: GenerateContiInput, ctx: GenerateContiContext): GenerateContiResult {
  const relevantSpecialties = new Set([...input.specialties, COMMON_SPECIALTY]);
  const templates = ctx.templates.filter((t) => relevantSpecialties.has(t.specialty));
  const templateById = new Map(ctx.templates.map((t) => [t.id, t]));

  const matched = matchCheckedTemplates(input, templates);
  addCommonTemplates(input, templates, matched);

  let sortCounter = 0;
  let scenes: DraftScene[] = [];
  for (const item of matched) {
    const expanded = expandPerDoctor(item, input.doctorCount, sortCounter);
    sortCounter += expanded.length;
    scenes.push(...expanded);
  }

  let spaceMatchedCount = 0;
  scenes = scenes.map((scene) => {
    const template = scene.templateId ? templateById.get(scene.templateId) : undefined;
    const { scene: withSpace, matched: didMatch } = assignSpaceAndGroup(scene, template, ctx.hospitalSpaces);
    if (didMatch) spaceMatchedCount += 1;
    return assignPeople(withSpace, template, ctx.hospitalStaff);
  });

  // 5) 그룹(층) 단위 정렬 — 원장 단위로 묶지 않는다. "미지정"은 항상 마지막.
  const groupOrder: string[] = [];
  for (const scene of scenes) {
    if (scene.group !== "미지정" && !groupOrder.includes(scene.group)) groupOrder.push(scene.group);
  }
  if (scenes.some((s) => s.group === "미지정")) groupOrder.push("미지정");

  const orderedScenes: DraftScene[] = [];
  let finalSort = 0;
  for (const groupName of groupOrder) {
    const inGroup = scenes.filter((s) => s.group === groupName).sort((a, b) => a.sort - b.sort);
    for (const scene of inGroup) {
      orderedScenes.push({ ...scene, sort: finalSort++ });
    }
  }

  const groups: DraftGroup[] = groupOrder.map((name, index) => ({ name, sort: index }));

  return {
    groups,
    scenes: orderedScenes,
    spaceMatchStats: { matched: spaceMatchedCount, total: orderedScenes.length },
  };
}
