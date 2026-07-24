import { describe, expect, it } from "vitest";
import { wrapQuoteText } from "./wrapQuoteText";

const measureByCharacter = (text: string) => Array.from(text).length * 10;

describe("wrapQuoteText", () => {
  it("keeps Korean words intact while wrapping", () => {
    const text = "우리가 반복적으로 하는 행동이 바로 우리 자신이다. 그러므로 탁월함은 행위가 아니라 습관이다.";
    const lines = wrapQuoteText(text, 150, measureByCharacter);

    expect(lines.join(" ")).toBe(text);
    for (const word of text.split(/\s+/)) {
      expect(lines.some((line) => line.includes(word))).toBe(true);
    }
  });

  it("splits only a token that is wider than the available line", () => {
    const lines = wrapQuoteText("짧은말 veryveryverylongword 마무리", 80, measureByCharacter);

    expect(lines.every((line) => measureByCharacter(line) <= 80)).toBe(true);
    expect(lines.join(" ").replace(/\s+/g, "")).toBe("짧은말veryveryverylongword마무리");
  });

  it("returns no lines for blank text", () => {
    expect(wrapQuoteText("   ", 100, measureByCharacter)).toEqual([]);
  });
});
