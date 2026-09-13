import {
  COMMON_SYSTEM_PROMPT,
  SCENE_MODEL,
  SCENE_MODEL_HIGH,
  getOpenAIClient,
  needsHighModel,
  photoSceneAnalysisSchema,
  type PhotoSceneAnalysisOutput,
} from "@/lib/ai/openai";
import { getDepartmentConfig } from "@/lib/photo-classifier/departments";
import type {
  HybridSceneType,
  SceneFrameAnalysis,
} from "@/lib/photo-classifier/hybrid-types";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export type SceneAiImage = {
  fileName: string;
  base64: string;
};

export type PurposeScanImage = SceneAiImage & {
  index: number;
};

const boundaryEnums = {
  location: [
    "consultation_room", "treatment_room", "laser_room", "procedure_room",
    "operating_room", "lobby", "corridor", "interior", "studio", "unknown",
  ],
  equipment: [
    "laser_device", "lifting_device", "injection", "skin_care_device", "bed",
    "consultation_desk", "camera", "none", "unknown",
  ],
  pose: ["standing", "sitting", "lying", "closeup", "unknown"],
  distance: ["wide", "full", "medium", "closeup", "macro", "unknown"],
  scene: ["profile", "consultation", "treatment", "skin_care", "interior", "etc"],
};

const boundarySchema = {
  name: "scene_boundary_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "peopleCount", "hasDoctor", "hasPatient", "hasStaff", "dominantPersonChanged", "personChangeConfidence",
      "locationType", "locationChanged", "locationChangeConfidence", "equipmentPresent", "equipmentCategory",
      "equipmentChanged", "equipmentChangeConfidence", "handpiecePresent", "syringePresent", "treatmentBedPresent",
      "consultationDeskPresent", "patientPose", "beforePatientPose", "afterPatientPose", "shotDistance",
      "beforeShotDistance", "afterShotDistance", "sceneType", "beforeSceneType", "afterSceneType",
      "sceneTypeChanged", "confidence", "reasons",
    ],
    properties: {
      peopleCount: { type: "integer", minimum: 0, maximum: 20 },
      hasDoctor: { type: "boolean" },
      hasPatient: { type: "boolean" },
      hasStaff: { type: "boolean" },
      dominantPersonChanged: { type: "boolean" },
      personChangeConfidence: { type: "number", minimum: 0, maximum: 1 },
      locationType: { type: "string", enum: boundaryEnums.location },
      locationChanged: { type: "boolean" },
      locationChangeConfidence: { type: "number", minimum: 0, maximum: 1 },
      equipmentPresent: { type: "boolean" },
      equipmentCategory: { type: "string", enum: boundaryEnums.equipment },
      equipmentChanged: { type: "boolean" },
      equipmentChangeConfidence: { type: "number", minimum: 0, maximum: 1 },
      handpiecePresent: { type: "boolean" },
      syringePresent: { type: "boolean" },
      treatmentBedPresent: { type: "boolean" },
      consultationDeskPresent: { type: "boolean" },
      patientPose: { type: "string", enum: boundaryEnums.pose },
      beforePatientPose: { type: "string", enum: boundaryEnums.pose },
      afterPatientPose: { type: "string", enum: boundaryEnums.pose },
      shotDistance: { type: "string", enum: boundaryEnums.distance },
      beforeShotDistance: { type: "string", enum: boundaryEnums.distance },
      afterShotDistance: { type: "string", enum: boundaryEnums.distance },
      sceneType: { type: "string", enum: boundaryEnums.scene },
      beforeSceneType: { type: "string", enum: boundaryEnums.scene },
      afterSceneType: { type: "string", enum: boundaryEnums.scene },
      sceneTypeChanged: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasons: { type: "array", items: { type: "string" }, maxItems: 6 },
    },
  },
} as const;

function boundaryPrompt(department: MedicalDepartment): string {
  const config = getDepartmentConfig(department);
  const sceneGuide = config.sceneTypes
    .filter((rule) => rule.sceneType !== "etc")
    .map((rule) => `- ${rule.displayName}: ${rule.description} / 단서 ${rule.visualCues.join(", ")}`)
    .join("\n");

  return `당신은 병원 촬영의 Scene 경계를 판정합니다. BEFORE 사진 묶음과 AFTER 사진 묶음이 실제로 다른 촬영 장면인지 비교하세요.

진료과: ${config.displayName}
장면 참고:
${sceneGuide}

sceneType/beforeSceneType/afterSceneType은 profile/consultation/treatment/skin_care/interior/etc 6개뿐입니다.
프로필 여부를 가장 먼저 검토하세요 — 사람 1명 이상(단독이든 여러 명이든 무관) + 환자 없음 + 카메라를 의식한 포즈 +
시술/상담/의료행위 행동 없음이면 인원수와 무관하게 profile입니다.

[강한 Scene 변경 — 아래 전환이면 sceneTypeChanged=true, 높은 확신도로 분리]
- 상담 → 시술 / 상담 → 프로필
- 시술 → 프로필 / 시술 → 인테리어
- 인테리어 → 상담 / 인테리어 → 프로필

[Scene 유지 — 아래는 같은 장면으로 유지, sceneTypeChanged=false]
- 같은 상담실에서 상담자만 바뀜(실장→원장 등) — 장소·목적이 같으면 유지
- 같은 시술 중 구도만 바뀜(와이드↔클로즈업, 각도 변경)
- 같은 공간에서 촬영 렌즈/거리만 바뀜

판정 우선순위:
1. 주요 환자 또는 의료진 그룹이 바뀌었는지
2. 상담실·시술실 등 장소(배경)가 바뀌었는지 — 단, 배경 변화 하나만으로는 분리하지 않는다.
   대표 촬영 특성상 같은 공간에서는 배경이 완전히 바뀌는 촬영을 거의 하지 않으므로, 배경이
   크게 달라졌다면 강한 분리 후보로 참고하되, 반드시 촬영목적(sceneType) 또는 인물의 행동
   또는 장비 변화가 함께 있어야 실제로 분리하세요.
3. 대형 장비·핸드피스·주사기·베드·상담 데스크가 등장하거나 종류가 바뀌었는지
4. 상담에서 시술, 앉음에서 누움 같은 의미 전환인지 (위 강한 변경 목록 참고)
5. 단순한 와이드·클로즈업 또는 반대 방향 촬영인지 (Scene 유지)

사람 이름이나 신원을 추측하지 마세요. 같은 사람인지 여부는 전후 그룹의 익명 시각적 연속성만 판단하세요.
같은 사람·장소·장비에서 구도만 바뀌었으면 changed 필드를 false로 유지하세요.
reasons는 경계 판단 이유를 짧은 한국어로 반환하세요.`;
}

function dataImage(base64: string): string {
  return base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
}

async function analyzeBoundaryWithModel(input: {
  department: MedicalDepartment;
  before: SceneAiImage[];
  after: SceneAiImage[];
  highModel: boolean;
}): Promise<SceneFrameAnalysis> {
  const imageBlock = (side: "BEFORE" | "AFTER", images: SceneAiImage[]) => [
    { type: "text" as const, text: `${side} (${images.length}장)` },
    ...images.map((image) => ({
      type: "image_url" as const,
      image_url: { url: dataImage(image.base64), detail: "high" as const },
    })),
  ];
  const response = await getOpenAIClient().chat.completions.create({
    model: input.highModel ? SCENE_MODEL_HIGH : SCENE_MODEL,
    messages: [
      { role: "system", content: boundaryPrompt(input.department) },
      {
        role: "user",
        content: [...imageBlock("BEFORE", input.before), ...imageBlock("AFTER", input.after)],
      },
    ],
    response_format: { type: "json_schema", json_schema: boundarySchema },
    max_tokens: 900,
  });
  return JSON.parse(response.choices[0]?.message?.content ?? "{}") as SceneFrameAnalysis;
}

export async function analyzeSceneBoundary(input: {
  department: MedicalDepartment;
  before: SceneAiImage[];
  after: SceneAiImage[];
  useHighModel?: boolean;
}): Promise<SceneFrameAnalysis> {
  if (input.before.length === 0 || input.after.length === 0) {
    throw new Error("경계 분석에는 앞뒤 이미지가 모두 필요합니다.");
  }
  if (input.before.length > 5 || input.after.length > 5) {
    throw new Error("경계 분석 이미지는 앞뒤 각각 최대 5장입니다.");
  }

  let analysis = await analyzeBoundaryWithModel({ ...input, highModel: Boolean(input.useHighModel) });
  if (!input.useHighModel && analysis.confidence < 0.65) {
    analysis = await analyzeBoundaryWithModel({ ...input, highModel: true });
  }
  return analysis;
}

const purposeScanSchema = {
  name: "purpose_scan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["labels"],
    properties: {
      labels: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "purpose", "confidence", "reason"],
          properties: {
            index: { type: "integer" },
            purpose: { type: "string", enum: ["profile", "consultation", "treatment", "skin_care", "interior", "etc"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" },
          },
        },
      },
    },
  },
} as const;

function purposePrompt(department: MedicalDepartment, indices: number[]): string {
  const config = getDepartmentConfig(department);
  const sceneGuide = config.sceneTypes
    .filter((rule) => rule.sceneType !== "etc")
    .map((rule) => `- ${rule.sceneType} (${rule.displayName}): ${rule.description} | 단서: ${rule.visualCues.join(", ")}`)
    .join("\n");
  return `당신은 병원 촬영 현장에서 하나의 임시 Scene(같은 시간대 묶음) 안에 촬영목적이 바뀌는 구간이
있는지 찾는 전문가입니다. 아래 이미지들은 index 순서(촬영 시간순)대로 제공됩니다.
각 이미지마다 촬영목적을 딱 하나씩 판정하세요.

진료과: ${config.displayName}
장면 참고:
${sceneGuide}

카테고리는 profile/consultation/treatment/skin_care/interior/etc 6개뿐입니다.
프로필 여부를 가장 먼저 검토하세요 — 사람 1명 이상(단독이든 여러 명이든 무관) + 환자 없음 +
카메라를 의식한 포즈 + 시술/상담/의료행위 행동이 없으면 profile입니다.

이미지 순서(index): ${indices.join(", ")}
labels 배열에는 위 index 각각에 대해 정확히 하나씩, 총 ${indices.length}개를 반환하세요.
목적이 애매하면 확신도를 낮게, 그래도 가장 근접한 카테고리로 답하세요.`;
}

export async function scanScenePurposes(input: {
  department: MedicalDepartment;
  images: PurposeScanImage[];
}): Promise<Array<{ index: number; purpose: HybridSceneType; confidence: number; reason: string }>> {
  if (input.images.length === 0 || input.images.length > 30) {
    throw new Error("촬영목적 분석 이미지는 1~30장이 필요합니다.");
  }
  const indices = input.images.map((image) => image.index);
  const response = await getOpenAIClient().chat.completions.create({
    model: SCENE_MODEL,
    messages: [{
      role: "user",
      content: [
        ...input.images.map((image) => ({
          type: "image_url" as const,
          image_url: { url: dataImage(image.base64), detail: "low" as const },
        })),
        { type: "text" as const, text: purposePrompt(input.department, indices) },
      ],
    }],
    response_format: { type: "json_schema", json_schema: purposeScanSchema },
    max_tokens: 200 * input.images.length,
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
    labels?: Array<{ index: number; purpose: HybridSceneType; confidence: number; reason: string }>;
  };
  return parsed.labels ?? [];
}

function scenePrompt(department: MedicalDepartment, sceneId: string): string {
  const config = getDepartmentConfig(department);
  const typeList = config.sceneTypes
    .slice()
    .sort((left, right) => left.priority - right.priority)
    .filter((rule) => rule.sceneType !== "etc")
    .map((rule) => `- ${rule.sceneType} (${rule.displayName}): ${rule.description} | 단서: ${rule.visualCues.join(", ")}`)
    .join("\n");
  const priorityOrder = config.sceneTypes
    .filter((rule) => rule.sceneType !== "etc")
    .sort((left, right) => left.priority - right.priority)
    .map((rule) => rule.displayName)
    .join(" > ");
  const exampleFolder = config.sceneTypes[0]?.folderName ?? "Scene";
  return `진료과: ${config.displayName}
Scene ID: ${sceneId}

분류 가능한 장면 타입:
${typeList}
- etc (ETC_확인필요): 위 유형으로 분류 불가하거나 조명불량, 테스트컷

우선순위 (낮은 번호 = 높은 우선순위):
${priorityOrder} > ETC

응답 시 sceneType 값은 반드시 위 목록의 영문 key 중 하나를 사용하세요.
suggestedFolderName은 한국어 폴더명만 반환하세요 (예: "${exampleFolder}").
판단이 어려우면 needsReview=true 또는 sceneType="etc"로 반환하세요.`;
}

async function analyzeSceneWithModel(input: {
  department: MedicalDepartment;
  sceneId: string;
  images: SceneAiImage[];
  model: string;
}): Promise<PhotoSceneAnalysisOutput> {
  const config = getDepartmentConfig(input.department);
  const response = await getOpenAIClient().chat.completions.create({
    model: input.model,
    messages: [
      { role: "system", content: COMMON_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          ...input.images.slice(0, 6).map((image) => ({
            type: "image_url" as const,
            image_url: { url: dataImage(image.base64), detail: "low" as const },
          })),
          { type: "text" as const, text: scenePrompt(input.department, input.sceneId) },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: photoSceneAnalysisSchema },
    max_tokens: 600,
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as Partial<PhotoSceneAnalysisOutput>;
  const sceneType = parsed.sceneType || "etc";
  const rule = config.sceneTypes.find((candidate) => candidate.sceneType === sceneType);
  return {
    department: input.department,
    sceneId: input.sceneId,
    sceneType,
    displayName: parsed.displayName || rule?.displayName || sceneType,
    suggestedFolderName: rule?.folderName ?? parsed.suggestedFolderName ?? sceneType,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    detectedCues: Array.isArray(parsed.detectedCues) ? parsed.detectedCues : [],
    negativeCues: Array.isArray(parsed.negativeCues) ? parsed.negativeCues : [],
    reason: parsed.reason || "",
    needsReview: parsed.needsReview === true,
    patientPosture: ["seated", "standing", "lying_down"].includes(parsed.patientPosture ?? "")
      ? parsed.patientPosture as PhotoSceneAnalysisOutput["patientPosture"]
      : "unclear",
    hasHandpiece: parsed.hasHandpiece === true,
    hasTreatmentDevice: parsed.hasTreatmentDevice === true,
    hasTreatmentBed: parsed.hasTreatmentBed === true,
    hasConsultationDesk: parsed.hasConsultationDesk === true,
  };
}

export async function analyzePhotoScene(input: {
  department: MedicalDepartment;
  sceneId: string;
  images: SceneAiImage[];
  useHighModel?: boolean;
}): Promise<PhotoSceneAnalysisOutput> {
  if (!input.images.length) throw new Error("Scene 분석 이미지가 필요합니다.");
  let result = await analyzeSceneWithModel({
    ...input,
    model: input.useHighModel ? SCENE_MODEL_HIGH : SCENE_MODEL,
  });
  if (!input.useHighModel && needsHighModel(result)) {
    result = await analyzeSceneWithModel({ ...input, model: SCENE_MODEL_HIGH });
  }
  return result;
}

export type ProfileAnalysis = {
  personCount: number;
  hasPatient: boolean;
  facingForward: boolean;
  intentionalPose: boolean;
  hasTreatmentAction: boolean;
  hasConsultationAction: boolean;
  isProfile: boolean;
  confidence: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function analyzeProfilePhoto(thumbnail: string): Promise<ProfileAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const prompt = `이 사진이 병원 프로필(인물) 사진인지 판단하세요. 반드시 아래 기준을 그대로 적용하세요.

1. personCount: 사진에 보이는 사람 수를 정확히 세세요 (0, 1, 2, 3 이상 중 하나).
2. hasPatient: 환자로 보이는 사람이 있으면 true (진료복이 아닌 일반 방문객/환자 자세인 사람). 의료진뿐이면 false.
3. facingForward: 주요 인물(들)이 얼굴을 카메라 쪽으로 향하고 있으면 true (완전 정면이 아니어도 얼굴이 카메라를 보고 있으면 true). 옆모습·뒷모습·고개를 숙이고 있으면 false.
4. intentionalPose: 팔짱을 끼거나, 손을 맞잡거나(손깍지), 가슴 앞에 손을 모으는 등 명확히 의도되고 정지된 포즈를 취하고 있으면 true. 걷는 중이거나, 무언가 작업/진료/대화 중이거나, 자연스러운 동작 중이면 false.
5. hasTreatmentAction: 주사기/핸드피스/장비 등으로 실제 시술·처치 중이면 true.
6. hasConsultationAction: 환자에게 설명 중이거나 차트/펜을 들고 상담 중이면 true.
7. isProfile: personCount가 1 이상이고, hasPatient가 false이고, (facingForward 또는 intentionalPose)가 true이고, hasTreatmentAction과 hasConsultationAction이 모두 false일 때만 true.
   사람이 여러 명이어도 전부 의료진이고 카메라를 보고 정지 포즈라면 true입니다 — 인원수만으로 제외하지 마세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "personCount": 2,
  "hasPatient": false,
  "facingForward": true,
  "intentionalPose": false,
  "hasTreatmentAction": false,
  "hasConsultationAction": false,
  "isProfile": true,
  "confidence": 0.9
}`;
  const imageData = thumbnail.replace(/^data:image\/(?:jpeg|png);base64,/, "");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageData } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  if (!response.ok) throw new Error(`프로필 분석 실패 (${response.status})`);
  const body = record(await response.json());
  const content = Array.isArray(body.content) ? body.content : [];
  const firstContent = record(content[0]);
  const text = typeof firstContent.text === "string" ? firstContent.text : "";
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error("프로필 분석 JSON을 읽지 못했습니다.");
  const parsed = record(JSON.parse(match[0]));
  const personCount = Number(parsed.personCount ?? 0);
  const hasPatient = parsed.hasPatient === true;
  const facingForward = parsed.facingForward === true;
  const intentionalPose = parsed.intentionalPose === true;
  const hasTreatmentAction = parsed.hasTreatmentAction === true;
  const hasConsultationAction = parsed.hasConsultationAction === true;
  return {
    personCount,
    hasPatient,
    facingForward,
    intentionalPose,
    hasTreatmentAction,
    hasConsultationAction,
    isProfile: personCount >= 1
      && !hasPatient
      && (facingForward || intentionalPose)
      && !hasTreatmentAction
      && !hasConsultationAction,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };
}
