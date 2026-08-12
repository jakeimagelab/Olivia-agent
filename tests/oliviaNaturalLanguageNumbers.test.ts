import { describe, expect, it } from "vitest";
import { parseKoreanCount, parseKoreanMoney, parseShotPosition } from "@/lib/olivia/naturalLanguageNumbers";

describe("Olivia Korean number normalization", () => {
  it.each([
    ["50만원", 500_000], ["50만", 500_000], ["오십만원", 500_000], ["50", 500_000], [500_000, 500_000],
  ])("normalizes money %s", (input, expected) => {
    expect(parseKoreanMoney(input)).toBe(expected);
  });

  it.each([["2개", 2], ["두 개", 2], ["세 컷", 3]])("normalizes count %s", (input, expected) => {
    expect(parseKoreanCount(input)).toBe(expected);
  });

  it("converts human shot positions to zero-based indexes", () => {
    expect(parseShotPosition("2번")).toBe(1);
  });
});
