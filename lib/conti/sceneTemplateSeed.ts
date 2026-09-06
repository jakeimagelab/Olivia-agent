// scene_templates 초기 데이터를 손으로 만들지 않고 기존 DB/코드 지식에서 뽑아낸다.
// 세 가지 출처를 합친다:
//  1) 공통 장면 (하모니컷/접수컷/상담컷) — app/api/conti/route.ts의 systemPrompt 고정 섹션
//  2) 통증계 진료과(PAIN_SPECS) 공통 핵심 장면 — 위와 동일한 systemPrompt 규칙
//  3) 진료과별 기본 장면 — specDefaults.ts의 keyShots를 장면 단위로 분리
//  4) 사례 기반 장면 — conti_case_scenes(분석 완료된 과거 콘티 PDF)를 진료과+장면명으로
//     중복 제거해 대표값을 뽑음
//
// 여기서 만든 값은 "합리적인 출발점"이지 정답이 아니다. 특히 피부과처럼 세부 시술이
// 40개 넘는 진료과는 이 스크립트가 만드는 5~6개짜리 얕은 목록으로는 부족하다 —
// 실제 세부 시술 목록(대분류·세부 항목 taxonomy)은 별도로 채워 넣어야 한다.

import { PAIN_SPECS, SPEC_DEFAULTS, normalizeSpec } from "./specDefaults";

export interface SceneTemplateSeedRow {
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
  usage_count: number;
}

export interface CaseSceneInput {
  department: string | null;
  sceneName: string | null;
  location: string | null;
  action: string | null;
  cameraAngle: string | null;
  direction: string | null;
  notes: string | null;
  subjects: string[] | null;
}

function toSceneKey(text: string): string {
  return text
    .replace(/[()·./]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

function uniqueSceneKey(base: string, used: Set<string>): string {
  let key = base || "장면";
  let i = 2;
  while (used.has(key)) {
    key = `${base}_${i}`;
    i += 1;
  }
  used.add(key);
  return key;
}

// "2층 외래 로비" → "외래 로비", "1F 로비" → "로비"
export function stripFloorPrefix(text: string): string {
  return text.replace(/^\s*(?:B?\d+\s*F|\d+\s*층)\s*/i, "").trim();
}

function parseRoles(staffText: string): string[] {
  return staffText
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^(.*?)\s*\d+\s*명$/);
      return (m ? m[1] : t).trim();
    })
    .filter(Boolean);
}

const SPACE_TYPE_HINTS: Array<[RegExp, string]> = [
  [/C-?ARM/i, "C-ARM실"],
  [/MRI/i, "MRI실"],
  [/X-?ray/i, "X-ray실"],
  [/초음파/, "초음파실"],
  [/물리치료/, "물리치료실"],
  [/도수치료/, "도수치료실"],
  [/운동치료/, "운동치료실"],
  [/재활/, "재활치료실"],
  [/레이저/, "레이저/시술실"],
  [/피부관리/, "피부관리실"],
  [/회복실/, "회복실"],
  [/상담/, "상담실"],
  [/채혈/, "채혈실"],
  [/내시경/, "내시경실"],
  [/골다공증/, "골다공증 검사실"],
  [/유닛체어/, "진료실"],
  [/파노라마/, "파노라마실"],
  [/분만/, "분만실"],
  [/탕전/, "탕전실"],
  [/침\s*치료/, "침치료실"],
  [/부항|추나/, "한방처치실"],
  [/수술/, "수술실"],
  [/세극등|안압|시력/, "진료실"],
  [/청각/, "청각검사실"],
  [/예방접종/, "예방접종실"],
  [/처치/, "처치실"],
  [/접수|인포/, "인포데스크"],
  [/대기실|로비/, "로비"],
  [/진료|모형|촉진|진찰|설명/, "진료실"],
];

function guessSpaceType(text: string): string {
  for (const [pattern, spaceType] of SPACE_TYPE_HINTS) {
    if (pattern.test(text)) return spaceType;
  }
  return "";
}

const COMMON_SCENES = [
  {
    name: "로비 하모니컷", minutes: 15, keyword: "하모니 / 따뜻한 병원",
    description: "의료진·간호사·직원이 함께 웃는 모습. 병원의 느낌을 보여주는 가장 중요한 컷. 병동이 있는 경우 병동 통로 회진 컷도 추가.",
    roles: ["원장", "간호사", "직원"], spaceType: "로비", needsPatient: false, perDoctor: false,
  },
  {
    name: "인포데스크 접수컷", minutes: 10, keyword: "친절한 접수",
    description: "환자가 실제 접수하고 직원이 안내하는 모습. 의료진도 함께 자연스럽게 연출 가능. 환자그룹 2팀이 접수하면서 안내받는 장면.",
    roles: ["직원", "환자"], spaceType: "인포데스크", needsPatient: true, perDoctor: false,
  },
  {
    name: "진료실 상담컷", minutes: 15, keyword: "신뢰있는 상담",
    description: "원장님이 환자에게 진료 상담하는 모습. 카메라 응시 + 비응시(자연스러운) 두 가지 촬영. 모형·엑스레이 결과 설명, 가족 동반 연출도 포함.",
    roles: ["원장", "환자"], spaceType: "진료실", needsPatient: true, perDoctor: true,
  },
] as const;

const PAIN_COMMON_SCENES: Array<{
  name: string; keyword: string; description: string; roles: string[]; spaceType: string;
}> = [
  {
    name: "C-ARM(씨암) 신경차단술", keyword: "집중하는 전문성",
    description: "허리·목 등 C-ARM 장비 앞에서 집중하는 모습 (방사선사 포함)",
    roles: ["원장", "방사선사", "환자"], spaceType: "C-ARM실",
  },
  {
    name: "초음파 보며 주사치료", keyword: "정밀 시술",
    description: "초음파 모니터 보면서 주사치료 집중하는 모습 (간호사 옆에서)",
    roles: ["원장", "간호사", "환자"], spaceType: "초음파실",
  },
  {
    name: "통증 진찰", keyword: "세심한 진찰",
    description: "환자 통증 부위 체크·촉진하는 모습",
    roles: ["원장", "환자"], spaceType: "진료실",
  },
  {
    name: "X-ray/MRI 판독", keyword: "전문적인 판독",
    description: "방사선사가 장비 작동, 원장님이 영상 설명하는 모습",
    roles: ["원장", "방사선사"], spaceType: "X-ray실",
  },
  {
    name: "재활/물리치료", keyword: "따뜻한 재활",
    description: "도수치료, 충격파, 운동치료 장면",
    roles: ["치료사", "환자"], spaceType: "물리치료실",
  },
];

function buildCommonSeeds(): SceneTemplateSeedRow[] {
  const used = new Set<string>();
  return COMMON_SCENES.map((scene) => ({
    specialty: "공통",
    category: "공통",
    scene_key: uniqueSceneKey(toSceneKey(scene.name), used),
    default_name: scene.name,
    default_keyword: scene.keyword,
    default_description: scene.description,
    default_minutes: scene.minutes,
    space_type: scene.spaceType,
    default_roles: [...scene.roles],
    needs_patient: scene.needsPatient,
    per_doctor: scene.perDoctor,
    usage_count: 0,
  }));
}

function buildPainSpecSeeds(): SceneTemplateSeedRow[] {
  const rows: SceneTemplateSeedRow[] = [];
  for (const specialty of PAIN_SPECS) {
    const used = new Set<string>();
    for (const scene of PAIN_COMMON_SCENES) {
      rows.push({
        specialty,
        category: "통증계 공통 장면",
        scene_key: uniqueSceneKey(toSceneKey(scene.name), used),
        default_name: scene.name,
        default_keyword: scene.keyword,
        default_description: scene.description,
        default_minutes: null,
        space_type: scene.spaceType,
        default_roles: [...scene.roles],
        needs_patient: scene.roles.includes("환자"),
        per_doctor: false,
        usage_count: 0,
      });
    }
  }
  return rows;
}

function buildSpecDefaultSeeds(): SceneTemplateSeedRow[] {
  const rows: SceneTemplateSeedRow[] = [];
  for (const [specialty, def] of Object.entries(SPEC_DEFAULTS)) {
    const used = new Set<string>();
    const staffRoles = parseRoles(def.staff);
    const phrases = def.keyShots.split(",").map((p) => p.trim()).filter(Boolean);
    for (const phrase of phrases) {
      const roles = Array.from(new Set(["원장", ...staffRoles, "환자"]));
      rows.push({
        specialty,
        category: "기본 장면",
        scene_key: uniqueSceneKey(toSceneKey(phrase), used),
        default_name: phrase,
        default_keyword: "",
        default_description: phrase,
        default_minutes: null,
        space_type: guessSpaceType(phrase),
        default_roles: roles,
        needs_patient: true,
        per_doctor: false,
        usage_count: 0,
      });
    }
  }
  return rows;
}

export function buildCaseLibrarySeeds(caseScenes: CaseSceneInput[]): SceneTemplateSeedRow[] {
  interface Group {
    specialty: string;
    sceneName: string;
    locations: Map<string, number>;
    descriptions: Map<string, number>;
    roles: Set<string>;
    count: number;
  }

  const groups = new Map<string, Group>();

  for (const row of caseScenes) {
    const sceneName = row.sceneName?.trim();
    if (!sceneName) continue;
    const specialty = normalizeSpec((row.department ?? "").trim() || "기타");
    const nameKey = sceneName.replace(/\s+/g, "");
    const key = `${specialty}__${nameKey}`;

    let group = groups.get(key);
    if (!group) {
      group = { specialty, sceneName, locations: new Map(), descriptions: new Map(), roles: new Set(), count: 0 };
      groups.set(key, group);
    }
    group.count += 1;
    if (row.location) group.locations.set(row.location, (group.locations.get(row.location) ?? 0) + 1);
    const description = [row.action, row.direction].filter(Boolean).join(" / ");
    if (description) group.descriptions.set(description, (group.descriptions.get(description) ?? 0) + 1);
    for (const role of row.subjects ?? []) group.roles.add(role);
  }

  const usedBySpecialty = new Map<string, Set<string>>();
  const rows: SceneTemplateSeedRow[] = [];

  for (const group of groups.values()) {
    const topLocation = [...group.locations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const topDescription = [...group.descriptions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const used = usedBySpecialty.get(group.specialty) ?? new Set<string>();
    usedBySpecialty.set(group.specialty, used);

    rows.push({
      specialty: group.specialty,
      category: "사례 기반 장면",
      scene_key: uniqueSceneKey(toSceneKey(group.sceneName), used),
      default_name: group.sceneName,
      default_keyword: "",
      default_description: topDescription,
      default_minutes: null,
      space_type: stripFloorPrefix(topLocation),
      default_roles: [...group.roles],
      needs_patient: group.roles.has("환자"),
      per_doctor: false,
      usage_count: group.count,
    });
  }

  return rows;
}

export function buildAllSeedRows(caseScenes: CaseSceneInput[]): SceneTemplateSeedRow[] {
  return [
    ...buildCommonSeeds(),
    ...buildPainSpecSeeds(),
    ...buildSpecDefaultSeeds(),
    ...buildCaseLibrarySeeds(caseScenes),
  ];
}
