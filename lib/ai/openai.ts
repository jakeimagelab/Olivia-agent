import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const SCENE_MODEL      = process.env.OPENAI_SCENE_MODEL      ?? "gpt-4.1-mini";
export const SCENE_MODEL_HIGH = process.env.OPENAI_SCENE_MODEL_HIGH ?? "gpt-4.1";

export const COMMON_SYSTEM_PROMPT = `당신은 병원 홍보/홈페이지용 사진 촬영 Scene 분류 전문가입니다.

입력된 이미지는 병원에서 촬영한 홍보용 사진입니다.
선택된 진료과의 Scene Type 목록과 판단 기준에 따라 이미지를 분류하세요.

분류 원칙:
- 장소만으로 판단하지 말고, 인물의 역할·행동·표정·장비·도구·복장·환자 자세·관계성을 함께 판단하세요.
- 확신이 낮으면 억지로 맞히지 말고 etc 또는 needsReview=true로 반환하세요.
- 하모니컷(harmony)은 장소가 아니라 여러 명이 함께 웃고 관계성을 보여주는 장면입니다.
- 프로필(profile)은 1인이 카메라를 정확히 응시하고 정지 포즈를 취한 경우에만 분류합니다.
- 상담 중 잠깐 카메라를 본 사진, 치료 중 카메라를 본 사진은 프로필이 아닙니다.
- suggestedFolderName은 진료과 config의 folderName 형식을 따르세요 (예: "임플란트수술", "C-ARM시술").
- 응답은 반드시 지정된 JSON Schema를 따르세요.`;

export const photoSceneAnalysisSchema = {
  name: "photo_scene_analysis",
  strict: true,
  schema: {
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
    },
  },
} as const;

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
};

const NEEDS_HIGH_MODEL_TYPES = new Set([
  "implant_surgery",
  "surgery_scene",
  "c_arm_procedure",
  "injection_treatment",
]);

export function needsHighModel(result: PhotoSceneAnalysisOutput): boolean {
  return (
    result.confidence < 0.65 ||
    result.needsReview ||
    result.sceneType === "etc" ||
    (NEEDS_HIGH_MODEL_TYPES.has(result.sceneType) && result.confidence < 0.80)
  );
}
