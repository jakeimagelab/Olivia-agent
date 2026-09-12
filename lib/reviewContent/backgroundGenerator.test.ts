import { describe, expect, it } from "vitest";
import {
  buildBackgroundGenerationRequest, buildBackgroundPrompt,
  decodeGeneratedBackgrounds,
  type BackgroundGenerationInput,
} from "./backgroundGenerator";

const input: BackgroundGenerationInput = {
  style: "minimal",
  tone: "cream",
  textures: ["paper", "shadow"],
  prompt: "은은한 아이보리 배경",
  count: 3,
};

describe("review background generator", () => {
  it("requests a background-only asset with editable text space", () => {
    const prompt = buildBackgroundPrompt({
      ...input,
      style: "editorial",
      prompt: "따뜻하고 차분한 분위기",
    });

    expect(prompt).toContain("background-only");
    expect(prompt).toContain("Do not include people");
    expect(prompt).toContain("letters, words, captions");
    expect(prompt).toContain("editable typography");
  });

  it("uses GPT Image output_format without the unsupported response_format", () => {
    const request = buildBackgroundGenerationRequest(input, "gpt-image-1");

    expect(request).toMatchObject({
      model: "gpt-image-1",
      n: 3,
      size: "1024x1536",
      quality: "medium",
      output_format: "png",
    });
    expect(request).not.toHaveProperty("response_format");
  });

  it("rejects a mismatched non-GPT image model with an actionable message", () => {
    expect(() => buildBackgroundGenerationRequest(input, "dall-e-3"))
      .toThrow("AI 배경 모델은 GPT Image 계열로 설정해 주세요.");
  });

  it("decodes every returned variant into the controlled asset shape", () => {
    const backgrounds = decodeGeneratedBackgrounds([
      { b64_json: Buffer.from("first").toString("base64") },
      { b64_json: Buffer.from("second").toString("base64") },
    ], 2, "gpt-image-1");

    expect(backgrounds).toHaveLength(2);
    expect(backgrounds[0].bytes.toString()).toBe("first");
    expect(backgrounds[1]).toMatchObject({ width: 1024, height: 1536, provider: "openai", model: "gpt-image-1" });
  });

  it("fails clearly when the provider returns fewer images than requested", () => {
    expect(() => decodeGeneratedBackgrounds([{ b64_json: "Zmlyc3Q=" }], 3, "gpt-image-1"))
      .toThrow("AI 배경 3개 중 1개만 반환되었습니다.");
  });
});
