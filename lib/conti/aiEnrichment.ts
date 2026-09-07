import { getOpenAIClient } from "@/lib/ai/openai";
import type { DraftScene } from "@/lib/conti/generate";

type EnrichedScene = {
  id: string;
  title: string;
  location: string;
  duration: number;
  description: string;
  people: string[];
  preparation: string[];
  keywords: string[];
  note: string;
};

const contiEnrichmentSchema = {
  name: "conti_scene_enrichment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["scenes"],
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "location", "duration", "description", "people", "preparation", "keywords", "note"],
          properties: {
            id: { type: "string" }, title: { type: "string" }, location: { type: "string" },
            duration: { type: "integer", minimum: 1, maximum: 180 }, description: { type: "string" },
            people: { type: "array", items: { type: "string" } },
            preparation: { type: "array", items: { type: "string" } },
            keywords: { type: "array", items: { type: "string" } }, note: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export async function enrichContiScenes(scenes: DraftScene[]): Promise<DraftScene[]> {
  if (!process.env.OPENAI_API_KEY || scenes.length === 0) return scenes;
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_CONTI_MODEL ?? "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "당신은 병원 홍보 촬영 콘티 전문가입니다. 입력 Scene을 삭제하거나 추가하지 말고 id를 절대 변경하지 마세요. procedures도 장면 분리 기준이 아닙니다. 촬영 동선에 맞게 순서만 조정하고 각 장면의 실무 정보를 간결한 한국어로 보강하세요.",
        },
        { role: "user", content: JSON.stringify({ scenes: scenes.map((scene) => ({ id: scene.id, title: scene.name, location: scene.spaceText, duration: scene.minutes, description: scene.description, people: scene.peopleText.split(",").map((item) => item.trim()).filter(Boolean), preparation: scene.preparationText, keywords: scene.keyword, note: scene.note, procedures: scene.procedures })) }) },
      ],
      response_format: { type: "json_schema", json_schema: contiEnrichmentSchema },
      max_tokens: 5000,
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { scenes?: EnrichedScene[] };
    const enriched = parsed.scenes;
    const expectedIds = scenes.map((scene) => scene.id).sort();
    const receivedIds = enriched?.map((scene) => scene.id).sort();
    if (!enriched || enriched.length !== scenes.length || JSON.stringify(expectedIds) !== JSON.stringify(receivedIds)) return scenes;

    const originalById = new Map(scenes.map((scene) => [scene.id, scene]));
    return enriched.map((item, sort) => {
      const original = originalById.get(item.id)!;
      return {
        ...original,
        sort,
        name: item.title.trim() || original.name,
        spaceText: item.location.trim() || original.spaceText,
        minutes: item.duration || original.minutes,
        description: item.description.trim() || original.description,
        peopleText: item.people.join(", ") || original.peopleText,
        preparationText: item.preparation.join(", ") || original.preparationText,
        keyword: item.keywords.join(" / ") || original.keyword,
        note: item.note,
        fieldSources: {
          ...original.fieldSources,
          name: "ai", space_text: "ai", minutes: "ai", description: "ai", people_text: "ai",
          preparation_text: "ai", keyword: "ai", note: item.note ? "ai" : original.fieldSources.note,
        },
      };
    });
  } catch (error) {
    console.error("[conti] AI enrichment failed; deterministic skeleton retained", error);
    return scenes;
  }
}
