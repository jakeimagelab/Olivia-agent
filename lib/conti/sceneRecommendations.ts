import { getOpenAIClient } from "@/lib/ai/openai";
import { buildCodeSceneTemplates, getDepartmentDefinition, getDepartmentLabel } from "@/lib/conti/departmentTaxonomy";
import { generateContiDraft } from "@/lib/conti/generate";

export type ContiSceneRecommendation = {
  id: string;
  groupName: string;
  name: string;
  keyword: string;
  description: string;
  minutes: number;
  spaceText: string;
  peopleText: string;
  patientRoleText: string;
  preparationText: string;
  media: "photo" | "photo_video" | "none";
  reason: string;
  source: "ai" | "default";
  openingOrder?: number;
};

type RecommendationInput = {
  specialty: string;
  existingSceneNames: string[];
  doctorNames?: string[];
  doctorCount?: number;
  intent?: string;
};

export const MANDATORY_OPENING_NAMES = ["단체사진", "단체 하모니컷", "인포데스크 하모니컷"] as const;

const PAIN_RECOMMENDATIONS: Array<Omit<ContiSceneRecommendation, "id" | "source">> = [
  {
    groupName: "시술",
    name: "C-ARM 신경차단술", keyword: "정밀 시술 · 전문성", minutes: 20, spaceText: "C-ARM실",
    description: "C-ARM 영상을 확인하며 신경차단술을 진행하는 장면. 의료진의 집중과 장비 활용이 함께 보이도록 촬영합니다.",
    peopleText: "의료진 / 방사선사 / 환자", patientRoleText: "엎드리거나 옆으로 누운 환자",
    preparationText: "C-ARM 장비 · 시술복 · 보호구 · 시술 동선 확인", media: "photo_video", reason: "마취통증의학과 핵심 시술",
  },
  {
    groupName: "시술",
    name: "초음파 유도 주사치료", keyword: "정밀 진단 · 집중", minutes: 20, spaceText: "초음파실",
    description: "초음파 화면으로 통증 부위를 확인하며 주사치료하는 장면. 화면과 의료진 손동작이 함께 보이도록 촬영합니다.",
    peopleText: "의료진 / 간호사 / 환자", patientRoleText: "시술 부위를 노출하고 안정된 자세를 취한 환자",
    preparationText: "초음파 장비 · 젤 · 시술 소모품 · 모니터 화면 정리", media: "photo_video", reason: "마취통증의학과 정밀 시술",
  },
  {
    groupName: "진료",
    name: "통증 부위 진찰 · 설명", keyword: "세심한 진찰 · 신뢰", minutes: 15, spaceText: "진료실",
    description: "환자의 통증 부위를 촉진하고 모형이나 차트를 이용해 원인을 설명하는 진료 장면입니다.",
    peopleText: "의료진 / 환자", patientRoleText: "통증 부위를 설명하고 진찰받는 환자",
    preparationText: "척추·관절 모형 · 진료 차트", media: "photo_video", reason: "통증 진료 과정을 설명하는 장면",
  },
  {
    groupName: "진료",
    name: "X-ray · MRI 영상 판독", keyword: "근거 중심 · 전문 판독", minutes: 15, spaceText: "진료실",
    description: "의료진이 X-ray 또는 MRI 영상을 가리키며 환자에게 통증 원인과 치료 계획을 설명하는 장면입니다.",
    peopleText: "의료진 / 환자", patientRoleText: "모니터를 보며 설명을 듣는 환자",
    preparationText: "판독용 영상 · 모니터 개인정보 제거", media: "photo_video", reason: "영상 기반 통증 진단",
  },
  {
    groupName: "상담",
    name: "시술 전 환자 상담", keyword: "안심 · 충분한 설명", minutes: 15, spaceText: "상담실",
    description: "시술 방법과 주의사항을 차분히 설명하고 환자의 질문에 답하는 상담 장면입니다.",
    peopleText: "의료진 / 환자", patientRoleText: "설명을 듣고 질문하는 환자",
    preparationText: "시술 안내 자료 · 동의서 소품", media: "photo_video", reason: "시술 전 신뢰 형성",
  },
];

function comparableName(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/[\s·/()_.-]+/g, "");
}

function recommendationId(name: string, index: number): string {
  return `${comparableName(name) || "scene"}-${index + 1}`;
}

function withoutExisting(
  recommendations: Array<Omit<ContiSceneRecommendation, "id">>,
  existingSceneNames: string[],
): ContiSceneRecommendation[] {
  const existing = new Set(existingSceneNames.map(comparableName));
  const seen = new Set<string>();
  return recommendations.flatMap((item, index) => {
    const key = comparableName(item.name);
    if (!key || existing.has(key) || seen.has(key)) return [];
    seen.add(key);
    return [{ ...item, id: recommendationId(item.name, index) }];
  }).slice(0, 6);
}

export function buildDefaultSceneRecommendations(input: RecommendationInput): ContiSceneRecommendation[] {
  const doctorCount = Math.max(1, input.doctorNames?.length || input.doctorCount || 1);
  const openingScenes = generateContiDraft({
    specialty: input.specialty,
    doctorCount,
    doctors: (input.doctorNames ?? []).map((name, index) => ({ id: `recommendation-doctor-${index + 1}`, name, surgeries: [], note: "", day: null })),
    staffFlags: { siljang: false, jikwon: false, other: false },
    harmony: false,
    personalOptions: { makeup: false, profile: false },
    checked: {},
    extraItems: [],
  }, {
    templates: buildCodeSceneTemplates(input.specialty),
    hospitalSpaces: [],
    hospitalStaff: [],
  }).scenes
    .filter((scene) => MANDATORY_OPENING_NAMES.includes(scene.name as (typeof MANDATORY_OPENING_NAMES)[number]))
    .map((scene) => ({
      groupName: "단체",
      name: scene.name,
      keyword: scene.keyword,
      description: scene.description,
      minutes: scene.minutes ?? 15,
      spaceText: scene.spaceText,
      peopleText: scene.peopleText,
      patientRoleText: scene.patientRoleText,
      preparationText: scene.preparationText,
      media: scene.media,
      reason: "모든 촬영 콘티의 고정 시작 장면",
      source: "default" as const,
      openingOrder: MANDATORY_OPENING_NAMES.indexOf(scene.name as (typeof MANDATORY_OPENING_NAMES)[number]),
    }));

  if (input.specialty === "pain-medicine" || getDepartmentLabel(input.specialty) === "마취통증의학과") {
    return withoutExisting([
      ...openingScenes,
      ...PAIN_RECOMMENDATIONS.map((item) => ({ ...item, source: "default" as const })),
    ], input.existingSceneNames);
  }

  const department = getDepartmentDefinition(input.specialty);
  const candidates = (department?.categories ?? []).map((category) => ({
    groupName: category.defaultSpace ?? "진료",
    name: category.label,
    keyword: "전문성 · 신뢰",
    description: `${category.label} 장면을 실제 진료 흐름에 맞게 자연스럽게 촬영합니다.`,
    minutes: category.defaultMinutes ?? 15,
    spaceText: category.defaultSpace ?? "진료실",
    peopleText: (category.roles ?? ["의료진", "환자"]).join(" / "),
    patientRoleText: category.patientRole ?? "환자",
    preparationText: `${category.details.length ? `${category.details.join(" · ")} 관련 ` : ""}장비와 촬영 동선 확인`,
    media: (category.patientRole ? "photo_video" : "photo") as ContiSceneRecommendation["media"],
    reason: `${department?.label ?? input.specialty} 기본 촬영 항목`,
    source: "default" as const,
  }));
  return withoutExisting([...openingScenes, ...candidates], input.existingSceneNames);
}

const recommendationSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "conti_scene_recommendations",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["scenes"],
      properties: {
        scenes: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["groupName", "name", "keyword", "description", "minutes", "spaceText", "peopleText", "patientRoleText", "preparationText", "media", "reason"],
            properties: {
              groupName: { type: "string" }, name: { type: "string" }, keyword: { type: "string" }, description: { type: "string" },
              minutes: { type: "integer", minimum: 5, maximum: 60 }, spaceText: { type: "string" },
              peopleText: { type: "string" }, patientRoleText: { type: "string" }, preparationText: { type: "string" },
              media: { type: "string", enum: ["photo", "photo_video", "none"] }, reason: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export async function recommendContiScenes(input: RecommendationInput): Promise<{
  recommendations: ContiSceneRecommendation[];
  source: "ai" | "default";
  notice?: string;
}> {
  const fallback = buildDefaultSceneRecommendations(input);
  if (!process.env.OPENAI_API_KEY) {
    return { recommendations: fallback, source: "default", notice: "AI 연결 없이 진료과 기본 추천을 보여드립니다." };
  }

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_CONTI_MODEL ?? "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 2600,
      response_format: recommendationSchema,
      messages: [
        {
          role: "system",
          content: "당신은 병원 홍보 사진·영상 촬영 콘티 전문가입니다. 진료과에 실제로 필요한 장면만 추천하세요. 각 장면의 groupName에는 장소명이 아니라 콘티에서 읽기 쉬운 구분(예: 단체, 진료, 시술, 상담)을 적으세요. 기존 장면과 겹치지 말고 과장되거나 의료적으로 부정확한 시술을 만들지 마세요. 응답은 지정된 JSON Schema를 따르세요.",
        },
        {
          role: "user",
          content: JSON.stringify({
            department: getDepartmentLabel(input.specialty),
            existingScenes: input.existingSceneNames,
            doctors: input.doctorNames ?? [],
            additionalRequest: input.intent?.trim() || null,
            referenceIdeas: fallback.map(({ name, reason }) => ({ name, reason })),
          }),
        },
      ],
    }, { timeout: 20_000 });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { scenes?: Array<Omit<ContiSceneRecommendation, "id" | "source">> };
    const mandatory = fallback.filter((item) => item.openingOrder !== undefined);
    const candidates = (parsed.scenes ?? []).map((item) => ({ ...item, source: "ai" as const }));
    const recommendations = withoutExisting([...mandatory, ...candidates], input.existingSceneNames);
    if (!recommendations.length) return { recommendations: fallback, source: "default", notice: "새 AI 추천이 없어 진료과 기본 추천을 보여드립니다." };
    return { recommendations, source: "ai" };
  } catch (error) {
    console.error("[conti] scene recommendation failed; default recommendations retained", error instanceof Error ? error.message : error);
    return { recommendations: fallback, source: "default", notice: "AI 추천을 불러오지 못해 진료과 기본 추천을 보여드립니다." };
  }
}

export function parseContiSceneRecommendation(value: unknown): Omit<ContiSceneRecommendation, "id" | "reason"> | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  if (!name) return null;
  const media = input.media === "photo_video" || input.media === "none" ? input.media : "photo";
  const openingOrder = MANDATORY_OPENING_NAMES.indexOf(name as (typeof MANDATORY_OPENING_NAMES)[number]);
  return {
    groupName: openingOrder >= 0
      ? "단체"
      : typeof input.groupName === "string" && input.groupName.trim()
        ? input.groupName.trim().slice(0, 100)
        : typeof input.spaceText === "string" && input.spaceText.trim()
          ? input.spaceText.trim().slice(0, 100)
          : "미지정",
    name,
    keyword: typeof input.keyword === "string" ? input.keyword.trim().slice(0, 200) : "",
    description: typeof input.description === "string" ? input.description.trim().slice(0, 2000) : "",
    minutes: Math.min(180, Math.max(0, Number(input.minutes) || 15)),
    spaceText: typeof input.spaceText === "string" ? input.spaceText.trim().slice(0, 200) : "",
    peopleText: typeof input.peopleText === "string" ? input.peopleText.trim().slice(0, 300) : "",
    patientRoleText: typeof input.patientRoleText === "string" ? input.patientRoleText.trim().slice(0, 300) : "",
    preparationText: typeof input.preparationText === "string" ? input.preparationText.trim().slice(0, 1000) : "",
    media,
    source: input.source === "default" ? "default" : "ai",
    ...(openingOrder >= 0 ? { openingOrder } : {}),
  };
}
