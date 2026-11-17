import { getOpenAIClient, SCENE_MODEL_HIGH } from "@/lib/ai/openai";

export function getOpenAiColorModel(): string {
  return process.env.OPENAI_COLOR_MODEL?.trim() || SCENE_MODEL_HIGH;
}

export function buildOpenAiColorVisionRequest(input: {
  imageBase64: string;
  imageMime: string;
  prompt: string;
}) {
  return {
    model: getOpenAiColorModel(),
    temperature: 0,
    max_tokens: 512,
    response_format: { type: "json_object" as const },
    messages: [{
      role: "user" as const,
      content: [
        { type: "text" as const, text: input.prompt },
        {
          type: "image_url" as const,
          image_url: {
            url: `data:${input.imageMime};base64,${input.imageBase64}`,
            detail: "high" as const,
          },
        },
      ],
    }],
  };
}

export async function requestOpenAiColorVisionJson(input: {
  imageBase64: string;
  imageMime: string;
  prompt: string;
}): Promise<Record<string, unknown>> {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OpenAI 키가 설정되지 않았어요.");
  const response = await getOpenAIClient().chat.completions.create(buildOpenAiColorVisionRequest(input));
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI 색감 분석 응답이 비어 있습니다.");
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not-object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI 색감 분석 응답을 해석하지 못했습니다.");
  }
}
