import { describe, expect, it } from "vitest";
import { buildHermesSystemPrompt } from "@/lib/hermes/systemPrompt";

// 모바일 요청서(2026-09-19) 작업 C — 조회 결과가 짧으면(10건 이하) 개수만 말하고 멈추지 않고
// 바로 나열한다. 폰에서는 "자세히 알려줘"를 다시 입력하는 비용이 특히 크다.
describe("buildHermesSystemPrompt — 짧은 목록 즉시 나열 규칙(작업 C)", () => {
  it("10건 이하 조회 결과를 바로 나열하라는 규칙이 포함된다", () => {
    const prompt = buildHermesSystemPrompt("req-1", { recentActions: [], revision: 0 });
    expect(prompt).toContain("10건 이하");
    expect(prompt).toContain("바로 나열");
  });

  it("10건을 넘으면 상위 몇 건 + 개수로 답하라는 규칙이 포함된다", () => {
    const prompt = buildHermesSystemPrompt("req-1", { recentActions: [], revision: 0 });
    expect(prompt).toContain("10건을 넘으면");
  });
});
