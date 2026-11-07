import { getOpenAIClient } from "@/lib/ai/openai";
import { PHOTO_QUALITY_DEFAULT_MODEL, type PhotoQualityModelAssessment } from "./types";

const RESPONSE_SCHEMA = {
  name: "photo_quality_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["eyes_closed", "face_too_dark", "motion_blur", "peopleVisible", "intentionalSilhouette", "intentionalMotion"],
    properties: {
      eyes_closed: signalSchema(),
      face_too_dark: signalSchema(),
      motion_blur: signalSchema(),
      peopleVisible: { type: "boolean" },
      intentionalSilhouette: { type: "boolean" },
      intentionalMotion: { type: "boolean" },
    },
  },
} as const;

function signalSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["detected", "confidence", "assessable", "reason"],
    properties: {
      detected: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      assessable: { type: "boolean" },
      reason: { type: "string", maxLength: 240 },
    },
  } as const;
}
const PROMPT = `사진 품질 검토 보조 결과를 JSON으로 반환하세요.
- eyes_closed: 실제로 보이는 사람의 눈이 완전히 또는 반 이상 감긴 경우. 옆모습, 고개 숙임, 안경 반사, 눈이 안 보임은 assessable=false로 둡니다. 단체사진은 일부 인물도 검사합니다.
- face_too_dark: 얼굴 영역의 노출이 부족해 인물을 식별하기 어려운 경우만 true. 전체 평균 밝기나 어두운 배경만으로 판정하지 않습니다. 의도적 실루엣은 intentionalSilhouette=true입니다.
- motion_blur: 얼굴이나 주 피사체가 카메라/피사체 움직임 때문에 선명하지 않은 경우. 배경 보케나 얕은 심도는 제외합니다. 의도적 움직임은 intentionalMotion=true입니다.
확신이 낮으면 detected를 억지로 true로 하지 말고 confidence를 낮추거나 assessable=false로 반환하세요.`;

export async function analyzePhotoQualityWithOpenAI(input: {
  imageDataUrl: string;
  model?: string;
}): Promise<{ model: string; assessment: PhotoQualityModelAssessment }> {
  const model = input.model ?? PHOTO_QUALITY_DEFAULT_MODEL;
  const response = await getOpenAIClient().chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 700,
    response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } },
      ],
    }],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI 품질 분석 응답이 비어 있습니다.");
  return { model, assessment: JSON.parse(content) as PhotoQualityModelAssessment };
}
