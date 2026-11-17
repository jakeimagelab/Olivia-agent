import { afterEach, describe, expect, it } from "vitest";

import { analyzePhotoColor } from "@/lib/photoRetouch/colorCheckService";
import { buildOpenAiColorVisionRequest, getOpenAiColorModel, requestOpenAiColorVisionJson } from "@/lib/photoRetouch/openaiVision";

const originalModel = process.env.OPENAI_COLOR_MODEL;
const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalModel === undefined) delete process.env.OPENAI_COLOR_MODEL;
  else process.env.OPENAI_COLOR_MODEL = originalModel;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

describe("photo retouch OpenAI vision request", () => {
  it("uses the configured model, JSON mode, and a data URL image", () => {
    process.env.OPENAI_COLOR_MODEL = "gpt-color-test";
    const request = buildOpenAiColorVisionRequest({
      imageBase64: "aGVsbG8=",
      imageMime: "image/jpeg",
      prompt: "JSON으로 분석",
    });
    expect(getOpenAiColorModel()).toBe("gpt-color-test");
    expect(request.model).toBe("gpt-color-test");
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.messages[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,aGVsbG8=", detail: "high" },
    });
  });

  it("shows the product message when the OpenAI key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(requestOpenAiColorVisionJson({ imageBase64: "x", imageMime: "image/jpeg", prompt: "분석" }))
      .rejects.toThrow("OpenAI 키가 설정되지 않았어요.");
  });

  it("keeps the existing decorated color-check response contract", async () => {
    const result = await analyzePhotoColor({
      imageBase64: "x",
      analyzer: async () => ({
        detected: true,
        skinHighlight: { r: 244, g: 224, b: 210 },
        skinMid: { r: 217, g: 186, b: 169 },
        skinShadow: { r: 182, g: 146, b: 130 },
        whiteRef: { r: 255, g: 255, b: 255, found: true },
        colorTemp: "뉴트럴",
        saturation: "적당",
        skinNote: "기준과 일치",
        confidence: 99,
      }),
    });
    expect(result).toMatchObject({
      ok: true,
      detected: true,
      matchScore: 100,
      current: { mid: { hex: "#D9BAA9" } },
      adjustments: { temperature: 0 },
    });
  });
});
