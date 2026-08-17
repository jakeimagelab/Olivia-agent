import { describe, expect, it } from "vitest";
import { parseKoreanCount, parseKoreanMoney, parseShotPosition, resolveOrdinalReference } from "@/lib/olivia/naturalLanguageNumbers";

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

  describe("resolveOrdinalReference — 숫자와 '마지막'/'처음' 계열 키워드를 모두 해석한다", () => {
    it("숫자 표현은 parseShotPosition과 동일하게 0-based로 바꾼다", () => {
      expect(resolveOrdinalReference("2번", 5)).toBe(1);
    });

    it.each(["마지막", "맨 아래", "맨 뒤", "끝"])("'%s'는 목록의 마지막 인덱스로 해석한다", (word) => {
      expect(resolveOrdinalReference(word, 5)).toBe(4);
    });

    it.each(["처음", "첫 번째", "맨 위"])("'%s'는 0번 인덱스로 해석한다", (word) => {
      expect(resolveOrdinalReference(word, 5)).toBe(0);
    });

    it("숫자도 키워드도 매치되지 않으면 undefined를 돌려준다", () => {
      expect(resolveOrdinalReference("아무거나", 5)).toBeUndefined();
    });

    it("count가 0 이하이면 키워드가 있어도 undefined를 돌려준다", () => {
      expect(resolveOrdinalReference("마지막", 0)).toBeUndefined();
    });
  });
});
