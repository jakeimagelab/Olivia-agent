import OpenAI from "openai";

export type BackgroundGenerationInput = {
  style: "minimal" | "clinic" | "editorial" | "luxury" | "natural";
  tone: "white" | "cream" | "mint" | "beige" | "deep-green";
  textures: Array<"paper" | "shadow" | "botanical" | "marble" | "fabric">;
  prompt: string;
  count: number;
};

export type GeneratedBackground = {
  bytes: Buffer;
  mimeType: "image/png";
  width: number;
  height: number;
  provider: string;
  model: string;
};

export interface BackgroundGenerator {
  generate(input: BackgroundGenerationInput): Promise<GeneratedBackground[]>;
}

const STYLE_LABELS = {
  minimal: "minimal premium editorial background with generous negative space",
  clinic: "clean and trustworthy premium clinic brand background",
  editorial: "refined magazine editorial background",
  luxury: "quiet luxury cosmetic clinic background, sophisticated and restrained",
  natural: "soft natural wellness background with subtle organic details",
} as const;

const TONE_LABELS = {
  white: "soft white monochrome palette",
  cream: "warm ivory and cream palette",
  mint: "very pale mint and white palette",
  beige: "warm beige and paper palette",
  "deep-green": "deep forest green with subtle warm highlights",
} as const;

const TEXTURE_LABELS = {
  paper: "delicate premium paper grain",
  shadow: "subtle soft window shadow",
  botanical: "restrained botanical shadow or out-of-focus leaf silhouette",
  marble: "very subtle matte marble texture",
  fabric: "soft refined fabric texture",
} as const;

export function buildBackgroundPrompt(input: BackgroundGenerationInput) {
  const textures = input.textures.map((value) => TEXTURE_LABELS[value]).join(", ");
  return [
    "Create a vertical background-only design asset for a Korean premium medical review card.",
    STYLE_LABELS[input.style],
    TONE_LABELS[input.tone],
    textures || "smooth understated texture",
    input.prompt.trim(),
    "4:5 portrait composition, calm lighting, low visual noise, plenty of clean space for editable typography and a portrait photograph.",
    "Do not include people, faces, body parts, logos, letters, words, captions, signage, watermarks, UI, borders, or mockups.",
  ].filter(Boolean).join(" ");
}

class OpenAIBackgroundGenerator implements BackgroundGenerator {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
    this.model = process.env.REVIEW_BACKGROUND_MODEL || "gpt-image-1";
  }

  async generate(input: BackgroundGenerationInput) {
    const prompt = buildBackgroundPrompt(input);
    const count = Math.max(1, Math.min(3, input.count));
    return Promise.all(Array.from({ length: count }, async () => {
      const response = await this.client.images.generate({
        model: this.model,
        prompt,
        n: 1,
        size: "1024x1536",
        quality: "medium",
        response_format: "b64_json",
      });
      const encoded = response.data?.[0]?.b64_json;
      if (!encoded) throw new Error("AI 배경 이미지가 반환되지 않았습니다.");
      return {
        bytes: Buffer.from(encoded, "base64"),
        mimeType: "image/png" as const,
        width: 1024,
        height: 1536,
        provider: "openai",
        model: this.model,
      };
    }));
  }
}

export function getBackgroundGenerator(): BackgroundGenerator {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI 배경 생성 API가 아직 연결되지 않았습니다.");
  return new OpenAIBackgroundGenerator(apiKey);
}
