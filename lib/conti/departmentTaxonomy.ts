import type { SceneTemplateRow } from "./generate";

export type ContiCategory = {
  id: string;
  label: string;
  details: string[];
  defaultMinutes?: number;
  defaultSpace?: string;
  roles?: string[];
  patientRole?: string;
};

export type ContiDepartment = {
  id: string;
  label: string;
  aliases?: string[];
  categories: ContiCategory[];
};

export type ContiSurgeryType = { id: string; label: string };

// 콘티 표·현장뷰·공유 화면이 함께 쓰는 중립/브랜드 계열 색입니다. 파란 강조색은 쓰지 않습니다.
export const CONTI_GROUP_COLORS = ["#155855", "#C94A1E", "#8A5EC2", "#B4823B", "#4C9E6E", "#B1477D", "#7D6B52", "#5B8078"] as const;

type CategoryOptions = Omit<Partial<ContiCategory>, "id" | "label" | "details">;

const category = (id: string, label: string, details: string[] = [], options: CategoryOptions = {}): ContiCategory => ({
  id,
  label,
  details,
  defaultMinutes: options.defaultMinutes ?? 15,
  defaultSpace: options.defaultSpace ?? "진료실",
  roles: options.roles ?? ["원장", "환자"],
  patientRole: options.patientRole ?? "환자",
});

const painCategories: ContiCategory[] = [
  category("doctor-consult", "원장 진료/상담"),
  category("xray", "X-ray", [], { defaultSpace: "X-ray실", roles: ["방사선사", "환자"] }),
  category("musculoskeletal-ultrasound", "근골격 초음파", [], { defaultSpace: "초음파실" }),
  category("c-arm", "C-ARM", [], { defaultSpace: "C-ARM실", defaultMinutes: 20, roles: ["원장", "방사선사", "환자"] }),
  category("injection", "주사치료", ["신경차단술", "관절주사", "프롤로", "인대강화주사", "통증주사"], { defaultSpace: "시술실" }),
  category("eswt", "체외충격파", ["ESWT"], { defaultSpace: "물리치료실", roles: ["치료사", "환자"] }),
  category("manual-therapy", "도수치료", ["목", "허리", "어깨", "골반"], { defaultMinutes: 20, defaultSpace: "도수치료실", roles: ["도수치료사", "환자"] }),
  category("physical-therapy", "물리치료", ["전기치료", "온열치료", "견인치료"], { defaultSpace: "물리치료실", roles: ["물리치료사", "환자"] }),
  category("exercise-therapy", "운동치료", ["스트레칭", "근력운동", "기구운동", "자세교정"], { defaultMinutes: 20, defaultSpace: "운동치료실", roles: ["운동치료사", "환자"] }),
  category("staff-consult", "실장/직원 상담", [], { defaultSpace: "상담실", roles: ["실장", "환자"] }),
];

export const DEPARTMENT_TAXONOMY: ContiDepartment[] = [
  {
    id: "dentistry", label: "치과", categories: [
      category("general-treatment", "일반치료", ["충치", "레진", "크라운", "신경치료", "스케일링"], { defaultSpace: "진료실" }),
      category("orthodontics", "교정치료", ["구강스캔", "장치부착", "투명교정"], { defaultSpace: "교정진료실" }),
      category("implant", "임플란트", ["CT", "상담", "식립", "보철"], { defaultMinutes: 20, defaultSpace: "임플란트실" }),
      category("pediatric-dentistry", "소아치과", ["소아검진", "불소", "실란트"], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자" }),
      category("doctor-consult", "원장상담/예진", ["구강상태 확인", "CT 설명", "치료계획"], { defaultSpace: "상담실" }),
      category("manager-consult", "실장상담", ["비용상담", "치료일정", "치료과정 안내"], { defaultSpace: "상담실", roles: ["실장", "환자"] }),
    ],
  },
  {
    id: "dermatology", label: "피부과", categories: [
      category("lifting", "리프팅", ["울쎄라", "써마지", "소프트웨이브", "온다", "인모드", "슈링크", "티타늄"], { defaultMinutes: 20, defaultSpace: "시술실" }),
      category("skin-booster", "스킨부스터", ["리쥬란", "Re2O", "쥬베룩", "기타"], { defaultMinutes: 20, defaultSpace: "시술실" }),
      category("botox", "보톡스", [], { defaultSpace: "시술실" }),
      category("filler", "필러", [], { defaultSpace: "시술실" }),
      category("pigmentation", "색소", ["피코", "토닝", "IPL/BBL", "잡티/흑자"], { defaultMinutes: 20, defaultSpace: "레이저실" }),
      category("acne", "여드름", ["압출", "염증주사", "레이저"], { defaultSpace: "레이저실" }),
      category("scar-pore", "흉터/모공", ["포텐자", "프락셀", "니들RF"], { defaultMinutes: 20, defaultSpace: "레이저실" }),
      category("skin-diagnosis", "피부진단", ["피부분석기", "피부촬영"], { defaultSpace: "피부진단실", roles: ["직원", "환자"] }),
      category("aesthetic", "에스테틱", ["클렌징", "진정관리", "LDM"], { defaultSpace: "관리실", roles: ["피부관리사", "환자"] }),
      category("doctor-consult", "원장상담"),
      category("manager-consult", "실장상담", [], { defaultSpace: "상담실", roles: ["실장", "환자"] }),
    ],
  },
  ...["정형외과", "재활의학과", "신경외과", "마취통증의학과"].map((label, index) => ({
    id: ["orthopedics", "rehabilitation-medicine", "neurosurgery", "pain-medicine"][index],
    label,
    categories: painCategories,
  })),
  {
    id: "korean-medicine", label: "한방병원 / 한의원", aliases: ["한방병원", "한의원"], categories: [
      category("doctor-consult", "한의사 진료", ["문진", "맥진", "상담"]),
      category("acupuncture", "침", ["일반침"], { defaultSpace: "침치료실", roles: ["한의사", "환자"] }),
      category("electro-acupuncture", "전침", ["전기침"], { defaultSpace: "침치료실", roles: ["한의사", "환자"] }),
      category("pharmacopuncture", "약침", [], { defaultSpace: "한방처치실", roles: ["한의사", "환자"] }),
      category("moxibustion", "뜸", [], { defaultSpace: "한방처치실", roles: ["한의사", "환자"] }),
      category("cupping", "부항", ["건식", "습식"], { defaultSpace: "한방처치실", roles: ["한의사", "환자"] }),
      category("chuna", "추나", ["경추", "요추", "골반"], { defaultMinutes: 20, defaultSpace: "추나실", roles: ["한의사", "환자"] }),
      category("herbal-medicine", "한약", ["상담", "처방", "조제"], { roles: ["한의사", "환자"] }),
      category("physical-therapy", "물리치료", [], { defaultSpace: "물리치료실", roles: ["치료사", "환자"] }),
      category("traffic-accident", "교통사고 치료", ["침", "약침", "추나", "물리치료"], { defaultMinutes: 20, roles: ["한의사", "환자"] }),
      category("staff-consult", "실장/직원 상담", [], { defaultSpace: "상담실", roles: ["실장", "환자"] }),
      category("ward", "병동", [], { defaultSpace: "병동", roles: ["직원", "환자"] }),
      category("admission", "입원", [], { defaultSpace: "병동", roles: ["직원", "환자"] }),
      category("rounds", "회진", [], { defaultSpace: "병동", roles: ["한의사", "환자"] }),
      category("rehabilitation", "재활", [], { defaultSpace: "재활치료실", roles: ["치료사", "환자"] }),
      category("collaboration", "협진", [], { roles: ["의료진", "환자"] }),
    ],
  },
  {
    id: "ophthalmology", label: "안과", categories: [
      category("manager-consult", "상담실장 상담", [], { defaultSpace: "상담실", roles: ["실장", "환자"] }),
      category("pediatric-dream-lens", "검사실(드림렌즈)", ["소아 시력검사", "사시/약시", "드림렌즈 검사", "렌즈 피팅"], { defaultMinutes: 20, defaultSpace: "검사실", roles: ["검사 담당자", "아이", "보호자"], patientRole: "아이, 보호자" }),
      category("group-surgery", "수술 연출(그룹 협진)", ["협진", "수술 준비", "장비 확인"], { defaultMinutes: 20, defaultSpace: "수술실", roles: ["의료진", "환자"] }),
      category("other-treatment", "기타 진료(안성형/IPL)", ["안성형", "IPL", "기타 안과 진료"], { defaultMinutes: 20, defaultSpace: "시술실" }),
      category("exterior", "외관", [], { defaultMinutes: 10, defaultSpace: "외관", roles: [], patientRole: "" }),
      category("interior", "내부 공간컷", [], { defaultMinutes: 15, defaultSpace: "병원 내부", roles: [], patientRole: "" }),
    ],
  },
  {
    id: "gynecology", label: "산부인과", categories: [
      category("general-gynecology", "일반 부인과 진료", ["질염", "방광염", "생리불순", "생리통", "부정출혈", "자궁근종", "난소질환"]),
      category("women-exam", "여성검진", ["초음파", "자궁경부암검사", "STD검사", "호르몬검사"], { defaultSpace: "검사실" }),
      category("women-laser", "여성 레이저/쁘띠", ["질레이저", "질타이트닝", "질필러", "Y존 미백", "제모"], { defaultMinutes: 20, defaultSpace: "시술실" }),
      category("women-plastic", "여성성형", ["소음순", "질성형", "대음순", "회음부"], { defaultMinutes: 20, defaultSpace: "시술실" }),
      category("incontinence-pelvic", "요실금/골반저"),
      category("menopause-antiaging", "갱년기/항노화"),
      category("iv-wellness", "수액/웰니스", [], { defaultSpace: "수액실", roles: ["간호사", "환자"] }),
    ],
  },
  {
    id: "plastic-surgery", label: "성형외과", categories: [
      category("face", "얼굴성형", ["눈", "코", "안면거상", "미니거상", "윤곽", "광대", "턱끝", "이마", "지방이식", "필러/보톡스"], { defaultMinutes: 20, defaultSpace: "상담실" }),
      category("breast", "가슴성형", ["가슴확대", "가슴축소", "가슴거상", "재수술", "보형물 교체", "유두/유륜"], { defaultMinutes: 20, defaultSpace: "상담실" }),
      category("body", "비만/체형", ["지방흡입", "복부", "팔", "허벅지", "옆구리", "등", "이중턱", "복부성형"], { defaultMinutes: 20, defaultSpace: "상담실" }),
      category("other", "기타", ["흉터", "재건", "디자인/마킹", "수술실", "회복실", "경과체크"], { defaultMinutes: 20, defaultSpace: "수술실" }),
    ],
  },
  {
    id: "pediatrics", label: "소아청소년과", aliases: ["소아과"], categories: [
      category("general-care", "일반진료", ["감기", "발열", "장염"], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자" }),
      category("vaccination", "예방접종", [], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자", defaultSpace: "예방접종실" }),
      category("infant-checkup", "영유아검진", [], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자" }),
      category("growth", "성장", ["키", "체중", "성장상담"], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자" }),
      category("allergy", "알레르기", ["비염", "아토피", "천식"], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자" }),
      category("respiratory", "호흡기", [], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자" }),
      category("digestive", "소화기", [], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자" }),
      category("development", "발달", ["발달검사"], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자" }),
      category("exam", "검사", ["청진", "체온", "혈액검사"], { roles: ["간호사", "아이", "보호자"], patientRole: "아이, 보호자", defaultSpace: "검사실" }),
      category("iv", "수액", [], { roles: ["간호사", "아이", "보호자"], patientRole: "아이, 보호자", defaultSpace: "수액실" }),
      category("doctor-consult", "원장상담", [], { roles: ["원장", "아이", "보호자"], patientRole: "아이, 보호자" }),
    ],
  },
  {
    id: "nursing-hospital", label: "요양병원", categories: [
      category("rounds", "의료진 회진", [], { defaultSpace: "병동", roles: ["의료진", "환자"] }),
      category("nursing", "간호", [], { defaultSpace: "병동", roles: ["간호사", "환자"] }),
      category("rehabilitation", "재활", [], { defaultMinutes: 20, defaultSpace: "재활치료실", roles: ["재활치료사", "환자"] }),
      category("exercise", "운동치료", [], { defaultSpace: "운동치료실", roles: ["운동치료사", "환자"] }),
      category("occupational", "작업치료", [], { defaultSpace: "작업치료실", roles: ["작업치료사", "환자"] }),
      category("swallowing", "연하치료", [], { defaultSpace: "치료실", roles: ["치료사", "환자"] }),
      category("cognition", "인지/치매 프로그램", [], { defaultMinutes: 20, defaultSpace: "프로그램실", roles: ["사회복지사", "환자"] }),
      category("ward-life", "병동생활", [], { defaultSpace: "병동", roles: ["직원", "환자"] }),
      category("guardian-consult", "보호자 상담", [], { defaultSpace: "상담실", roles: ["의료진", "보호자"], patientRole: "보호자" }),
      category("caregiving", "간병", [], { defaultSpace: "병동", roles: ["간병인", "환자"] }),
      category("facility", "시설", [], { defaultSpace: "병원 시설", roles: [], patientRole: "" }),
      category("program", "프로그램", [], { defaultMinutes: 20, defaultSpace: "프로그램실", roles: ["직원", "환자"] }),
    ],
  },
];

export const CONTI_DEPARTMENT_LIST = DEPARTMENT_TAXONOMY.map(({ id, label }) => ({ id, label }));

// 의료진 개인 촬영에서 자동으로 포함되는 장면은 진료과 선택 목록에 다시 노출하지 않는다.
export const AUTO_INCLUDED_CONTI_CATEGORY_IDS = ["doctor-consult", "doctor-surgery"] as const;

export function getSelectableContiCategories(value: string): ContiCategory[] {
  const automatic = new Set<string>(AUTO_INCLUDED_CONTI_CATEGORY_IDS);
  return (getDepartmentDefinition(value)?.categories ?? []).filter((item) => !automatic.has(item.id));
}

export function getDepartmentDefinition(value: string): ContiDepartment | undefined {
  return DEPARTMENT_TAXONOMY.find((department) => department.id === value || department.label === value || department.aliases?.includes(value));
}

export function getDepartmentLabel(value: string): string {
  if (value === "imported") return "가져온 촬영 콘티";
  return getDepartmentDefinition(value)?.label ?? value;
}

export function getDepartmentContiTitle(value: string): string {
  const label = getDepartmentLabel(value);
  if (value === "imported" || label.endsWith("촬영 콘티")) return label;
  if (value === "촬영") return "촬영 콘티";
  return `${label} 촬영 콘티`;
}

const SURGERY_TYPES_BY_DEPARTMENT: Partial<Record<string, ContiSurgeryType[]>> = {
  ophthalmology: [
    { id: "lasik", label: "라식·라섹" },
    { id: "cataract", label: "백내장" },
    { id: "retina", label: "망막" },
    { id: "eye-plastic", label: "안성형" },
  ],
  dentistry: [
    { id: "general-treatment", label: "일반치료" },
    { id: "orthodontics", label: "교정" },
    { id: "implant", label: "임플란트" },
    { id: "pediatric-dentistry", label: "소아치과" },
  ],
  dermatology: [
    { id: "lifting", label: "리프팅" },
    { id: "skin-booster", label: "스킨부스터" },
    { id: "pigmentation", label: "색소" },
    { id: "acne", label: "여드름" },
  ],
};

export function getSurgeryTypesForDepartment(value: string): ContiSurgeryType[] {
  const configured = SURGERY_TYPES_BY_DEPARTMENT[value];
  if (configured) return configured;
  return (getDepartmentDefinition(value)?.categories ?? []).slice(0, 4).map((item) => ({ id: item.id, label: item.label }));
}

export function getSurgeryTypeLabel(department: string, value: string): string {
  if (value.startsWith("custom:")) return value.slice("custom:".length);
  return getSurgeryTypesForDepartment(department).find((item) => item.id === value)?.label ?? value;
}

export function buildCodeSceneTemplates(departmentValue: string): SceneTemplateRow[] {
  const department = getDepartmentDefinition(departmentValue);
  const rows: SceneTemplateRow[] = [
    mandatoryOpeningTemplate("group-photo", "단체사진", "로비"),
    mandatoryOpeningTemplate("group-harmony", "단체 하모니컷", "로비 · 복도"),
    mandatoryOpeningTemplate("reception-harmony", "인포데스크 하모니컷", "로비"),
    commonTemplate("reception", "접수/안내", "로비", 10, ["직원", "환자"]),
    commonTemplate("staff-work", "직원 업무", "병원 내부", 10, ["직원"]),
    commonTemplate("doctor-makeup", "헤어메이크업 · 준비", "준비실", 10, ["의료진"], true, "none"),
    commonTemplate("doctor-profile", "의료진 프로필", "프로필 촬영 공간", 15, ["의료진"], true, "photo"),
    commonTemplate("doctor-consult", "진료 연출", "진료실", 20, ["의료진", "환자"], true, "photo_video"),
    commonTemplate("doctor-surgery", "수술 연출", "수술실", 15, ["의료진", "환자"], true, "photo_video"),
    commonTemplate("manager-consult", "실장 상담", "상담실", 10, ["실장", "환자"]),
    commonTemplate("harmony", "로비 하모니컷", "로비", 10, ["의료진", "직원"]),
  ];
  if (!department) return rows;
  for (const item of department.categories) {
    rows.push({
      id: `code:${department.id}:${item.id}`,
      specialty: department.id,
      category: item.id,
      scene_key: item.id,
      default_name: item.label,
      default_keyword: "전문성 / 신뢰 / 자연스러운 진료",
      default_description: `${item.label} 장면을 실제 진료 흐름에 맞게 자연스럽게 촬영`,
      default_minutes: item.defaultMinutes ?? 15,
      space_type: item.defaultSpace ?? "진료실",
      default_roles: item.roles ?? ["원장", "환자"],
      needs_patient: Boolean(item.patientRole),
      per_doctor: false,
      repeat_scope: "once",
      media: "photo",
      preparation_text: `${item.details.length ? item.details.join(", ") + " 관련 " : ""}장비·소품과 촬영 동선 확인`,
      default_note: "",
      patient_role_text: item.patientRole ?? "환자",
    });
  }
  return rows;
}

function mandatoryOpeningTemplate(key: string, name: string, space: string): SceneTemplateRow {
  return {
    id: `code:common:${key}`, specialty: "공통", category: "단체", scene_key: key,
    default_name: name, default_keyword: "", default_description: "", default_minutes: 15,
    space_type: space, default_roles: [], needs_patient: false, per_doctor: false,
    repeat_scope: "once", media: "photo", preparation_text: "", default_note: "", patient_role_text: "",
  };
}

function commonTemplate(key: string, name: string, space: string, minutes: number, roles: string[], perDoctor = false, media: SceneTemplateRow["media"] = "photo"): SceneTemplateRow {
  return {
    id: `code:common:${key}`, specialty: "공통", category: "공통", scene_key: key,
    default_name: name, default_keyword: "친절 / 신뢰 / 자연스러운 응대",
    default_description: `${name} 모습을 자연스럽게 촬영`, default_minutes: minutes,
    space_type: space, default_roles: roles, needs_patient: roles.includes("환자"), per_doctor: perDoctor,
    repeat_scope: perDoctor ? "per_doctor" : "once", media,
    preparation_text: "촬영 공간 정리, 참여 인원과 동선 확인", default_note: "",
    patient_role_text: roles.includes("환자") ? "환자" : "",
  };
}
