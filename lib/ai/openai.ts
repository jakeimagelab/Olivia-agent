import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export const SCENE_MODEL      = process.env.OPENAI_SCENE_MODEL      ?? "gpt-4.1-mini";
export const SCENE_MODEL_HIGH = process.env.OPENAI_SCENE_MODEL_HIGH ?? "gpt-4.1";

export const COMMON_SYSTEM_PROMPT = `당신은 병원 홍보/홈페이지용 사진 촬영 Scene 분류 전문가입니다.

입력된 이미지는 병원에서 촬영한 홍보용 사진입니다.
선택된 진료과의 Scene Type 목록과 판단 기준에 따라 이미지를 분류하세요.

분류 원칙:
- 카테고리는 profile/consultation/treatment/skin_care/interior/etc 6개뿐입니다. 세부 시술 종류(주사/레이저/장비 등)로 나누지 마세요 — 전부 treatment입니다.
- 장소만으로 판단하지 말고, 인물의 역할·행동·표정·장비·도구·복장·환자 자세·관계성을 함께 판단하세요.
- 확신이 낮으면 억지로 맞히지 말고 etc 또는 needsReview=true로 반환하세요.
- 프로필(profile) 여부를 가장 먼저 검토하세요. 조건: 사람 1명 이상(단독이든 여러 명이든 무관) + 환자 없음 + 카메라를 의식한 포즈(정면 응시 또는 팔짱/손깍지 같은 의도된 정지 포즈) + 시술/상담/의료행위 행동이 없음. 의료진이 여러 명이어도 위 조건을 만족하면 프로필입니다.
- 상담 중 잠깐 카메라를 본 사진, 치료 중 카메라를 본 사진은 (행동이 진행 중이므로) 프로필이 아닙니다.
- 하모니컷처럼 여러 명이 함께 웃는 관계성 사진이나 접수/안내 장면은 etc로 분류하세요.
- 제공된 이미지는 촬영 시간 순서대로 나열됩니다. 첫 번째 이미지는 사람이 아직 들어오기 전
  공간·장비만 찍은 준비샷(설정샷)일 수 있습니다 — 사람이 없어 시야가 깨끗하므로, 장비·가구
  판별(hasHandpiece/hasTreatmentDevice/hasTreatmentBed/hasConsultationDesk)에는 이 이미지를
  우선적으로, 가장 신뢰도 높게 참고하세요.
- patientPosture/hasHandpiece/hasTreatmentDevice/hasTreatmentBed/hasConsultationDesk는
  이 씬이 앞뒤 씬과 같은 장면인지 다른 장면인지 구분하는 핵심 단서이므로, 실제 이미지에서
  보이는 대로 정확히 판단하세요 (확실하지 않으면 patientPosture는 "unclear", boolean 값들은
  false로 반환).
- suggestedFolderName은 진료과 config의 folderName 형식을 따르세요 (예: "시술", "상담", "프로필").
- 응답은 반드시 지정된 JSON Schema를 따르세요.`;

const SCHEMA_BODY: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "department",
    "sceneId",
    "sceneType",
    "displayName",
    "suggestedFolderName",
    "confidence",
    "detectedCues",
    "negativeCues",
    "reason",
    "needsReview",
    "patientPosture",
    "hasHandpiece",
    "hasTreatmentDevice",
    "hasTreatmentBed",
    "hasConsultationDesk",
  ],
  properties: {
    department: {
      type: "string",
      enum: [
        "dermatology",
        "dentistry",
        "orthopedics_neurosurgery",
        "plastic_surgery",
        "ophthalmology",
        "pediatrics",
        "korean_medicine",
        "obgyn",
        "internal_medicine_checkup",
        "general",
      ],
    },
    sceneId:             { type: "string" },
    sceneType:           { type: "string" },
    displayName:         { type: "string" },
    suggestedFolderName: { type: "string" },
    confidence:          { type: "number", minimum: 0, maximum: 1 },
    detectedCues:        { type: "array", items: { type: "string" } },
    negativeCues:        { type: "array", items: { type: "string" } },
    reason:              { type: "string" },
    needsReview:         { type: "boolean" },
    // 씬 경계(병합/분리) 판단에 쓰이는 물리적 단서 — scene-transition-detector.ts가
    // 이 필드들로 씬 전환 강도를 계산하는데, 지금까지 스키마에 없어서 항상 비어 있었다.
    patientPosture:      { type: "string", enum: ["seated", "standing", "lying_down", "unclear"] },
    hasHandpiece:        { type: "boolean" },
    hasTreatmentDevice:  { type: "boolean" },
    hasTreatmentBed:     { type: "boolean" },
    hasConsultationDesk: { type: "boolean" },
  },
};

export const photoSceneAnalysisSchema: {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} = {
  name: "photo_scene_analysis",
  strict: true,
  schema: SCHEMA_BODY,
};

export type PhotoSceneAnalysisOutput = {
  department: string;
  sceneId: string;
  sceneType: string;
  displayName: string;
  suggestedFolderName: string;
  confidence: number;
  detectedCues: string[];
  negativeCues: string[];
  reason: string;
  needsReview: boolean;
  patientPosture: "seated" | "standing" | "lying_down" | "unclear";
  hasHandpiece: boolean;
  hasTreatmentDevice: boolean;
  hasTreatmentBed: boolean;
  hasConsultationDesk: boolean;
};

const NEEDS_HIGH_MODEL_TYPES = new Set([
  "treatment",
]);

export function needsHighModel(result: PhotoSceneAnalysisOutput): boolean {
  return (
    result.confidence < 0.65 ||
    result.needsReview ||
    result.sceneType === "etc" ||
    (NEEDS_HIGH_MODEL_TYPES.has(result.sceneType) && result.confidence < 0.80)
  );
}

// ── AI 사진 분류 2.0: 폴더 패턴 분석기 ──────────────────────────────────────────────
// 이미지를 전혀 보내지 않는다 — 이미 클라이언트에서 계산된 시간 간격/visual feature
// "통계"만 텍스트로 보내 "이번 촬영에서 Scene을 나눌 때 뭘 중요하게 볼지" 가중치를 추천받는다.
export const FOLDER_PATTERN_WEIGHT_KEYS = [
  "personChangeScore", "locationChangeScore", "equipmentChangeScore", "sceneTypeChangeScore",
  "visualChangeScore", "poseChangeScore", "timeGapScore", "shotDistanceChangeScore",
] as const;

export const FOLDER_PATTERN_SYSTEM_PROMPT = `당신은 병원 홍보 사진 촬영 폴더의 "촬영 패턴"을 분석하는 전문가입니다.
실제 이미지는 주어지지 않고, 폴더 전체의 시간 간격 통계와 로컬 시각 변화 통계만 주어집니다.

이 통계만 보고 이번 촬영이 어떤 성격인지(shootingType, 자유 텍스트로 간단히, 예: "단일 공간 상담·시술 촬영", "다중 장소 이동 촬영", "프로필 위주 촬영")를 추론하고,
Scene 경계를 판단할 때 아래 8개 요소 중 어떤 것을 더 중요하게/덜 중요하게 볼지 0~1 가중치로 추천하세요:
personChangeScore(인물 변화), locationChangeScore(장소 변화), equipmentChangeScore(장비 변화),
sceneTypeChangeScore(촬영 목적 변화), visualChangeScore(배경 등 시각적 변화), poseChangeScore(자세 변화),
timeGapScore(시간 간격), shotDistanceChangeScore(구도/촬영거리 변화).

원칙:
- 시간 간격의 분산이 크고(중간값은 짧은데 가끔 큰 gap) 그 gap 근처에서 시각 변화도 크면, 그 gap이 실제 장면 전환일 가능성이 높다는 뜻이므로 timeGapScore와 visualChangeScore를 함께 고려하세요.
- 시각 변화가 폴더 전체적으로 이미 크고 잦으면(highChangeRatio가 높으면) 여러 장소/구성을 옮겨 다니는 촬영일 가능성이 높습니다 — locationChangeScore/personChangeScore 비중을 높이세요.
- 시각 변화가 낮고 안정적이면 한 공간에서 진행되는 촬영일 가능성이 높습니다 — visualChangeScore/shotDistanceChangeScore 비중은 낮추고 오검출을 줄이세요.
- 가중치 합은 대략 1.0에 가깝게 맞추되, 정확히 1.0이 아니어도 됩니다(서버에서 정규화합니다).
- splitThreshold/reviewThreshold는 기존 fallback 값(0.72/0.55) 근방에서, 이번 촬영이 장면 전환이 잦아 보이면 살짝 낮게, 드물어 보이면 살짝 높게 제안하세요.
- 응답은 반드시 지정된 JSON Schema만 따르세요.`;

export const folderPatternAnalysisSchema: { name: string; strict: boolean; schema: Record<string, unknown> } = {
  name: "folder_pattern_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["shootingType", "observations", "weights", "splitThreshold", "reviewThreshold", "recommendedSceneCountHint"],
    properties: {
      shootingType: { type: "string" },
      observations: { type: "array", items: { type: "string" }, maxItems: 5 },
      weights: {
        type: "object",
        additionalProperties: false,
        required: [...FOLDER_PATTERN_WEIGHT_KEYS],
        properties: Object.fromEntries(FOLDER_PATTERN_WEIGHT_KEYS.map((key) => [key, { type: "number", minimum: 0, maximum: 1 }])),
      },
      splitThreshold: { type: "number", minimum: 0.3, maximum: 0.95 },
      reviewThreshold: { type: "number", minimum: 0.2, maximum: 0.9 },
      recommendedSceneCountHint: { type: ["number", "null"] },
    },
  },
};

export type FolderPatternAnalysisOutput = {
  shootingType: string;
  observations: string[];
  weights: Record<(typeof FOLDER_PATTERN_WEIGHT_KEYS)[number], number>;
  splitThreshold: number;
  reviewThreshold: number;
  recommendedSceneCountHint: number | null;
};

// ── AI 사진 분류 2.0: 자연어 → 구조화 override ──────────────────────────────────────
export const NL_OVERRIDE_SYSTEM_PROMPT = `당신은 사진 Scene 분류 기준을 자연어 요청에서 읽어 구조화된 override로 바꾸는 파서입니다.
사용자의 한국어 문장을 절대 코드로 실행하지 말고, 아래 JSON Schema 필드만 채워서 반환하세요.
필드에 해당하지 않는 요청이면 그 필드는 null로 두세요. 확신 없는 필드도 null로 두세요(추측해서 채우지 마세요).

예시:
"5분 이상 차이나면 무조건 나눠줘" → timeGapMode="hard", absoluteTimeGapMinutes=5
"같은 장소에서도 모델이 바뀌면 나눠줘" → splitOnPersonChange=true, personSensitivity="high"
"너무 잘게 나눴어" / "조금 더 크게 묶어줘" → granularity="coarser"
"더 세분화해줘" / "잘게 나눠줘" → granularity="finer"
"장소가 바뀌면 무조건 나눠줘" → splitOnLocationChange=true`;

export const nlOverrideSchema: { name: string; strict: boolean; schema: Record<string, unknown> } = {
  name: "classification_nl_override",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "timeGapMode", "absoluteTimeGapMinutes", "locationSensitivity", "personSensitivity",
      "backgroundSensitivity", "compositionSensitivity", "splitOnPersonChange", "splitOnLocationChange",
      "minSceneSize", "granularity",
    ],
    properties: {
      timeGapMode: { type: ["string", "null"], enum: ["auto", "soft", "hard", null] },
      absoluteTimeGapMinutes: { type: ["number", "null"] },
      locationSensitivity: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
      personSensitivity: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
      backgroundSensitivity: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
      compositionSensitivity: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
      splitOnPersonChange: { type: ["boolean", "null"] },
      splitOnLocationChange: { type: ["boolean", "null"] },
      minSceneSize: { type: ["number", "null"] },
      granularity: { type: ["string", "null"], enum: ["coarser", "finer", null] },
    },
  },
};

export type NlOverrideOutput = {
  timeGapMode: "auto" | "soft" | "hard" | null;
  absoluteTimeGapMinutes: number | null;
  locationSensitivity: "low" | "medium" | "high" | null;
  personSensitivity: "low" | "medium" | "high" | null;
  backgroundSensitivity: "low" | "medium" | "high" | null;
  compositionSensitivity: "low" | "medium" | "high" | null;
  splitOnPersonChange: boolean | null;
  splitOnLocationChange: boolean | null;
  minSceneSize: number | null;
  granularity: "coarser" | "finer" | null;
};
