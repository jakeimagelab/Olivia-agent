import { describe, expect, it } from "vitest";
import { buildMatchSummaryText } from "@/lib/selectMatch/matchSummary";

describe("셀렉 매칭 완료 요약 텍스트", () => {
  it("누락 없으면 못 찾은 파일 목록을 붙이지 않는다", () => {
    expect(buildMatchSummaryText(5, 5, 0, [])).not.toMatch(/못 찾은/);
  });

  it("누락이 10개 넘으면 앞 10개만 보여주고 나머지 개수를 요약한다", () => {
    const missing = Array.from({ length: 15 }, (_, i) => `dsc_${i}`);
    const text = buildMatchSummaryText(15, 0, 15, missing);
    expect(text).toMatch(/외 5개/);
    expect(text.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(10);
  });
});
