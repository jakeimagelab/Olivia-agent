import { describe, expect, it } from "vitest";
import { buildBackgroundPrompt } from "./backgroundGenerator";

describe("review content AI background prompt", () => {
  it("requests a background-only asset with editable text space", () => {
    const prompt = buildBackgroundPrompt({
      style: "editorial",
      tone: "cream",
      textures: ["paper", "shadow"],
      prompt: "따뜻하고 차분한 분위기",
      count: 3,
    });
    expect(prompt).toContain("background-only");
    expect(prompt).toContain("Do not include people");
    expect(prompt).toContain("letters, words, captions");
    expect(prompt).toContain("editable typography");
  });
});
