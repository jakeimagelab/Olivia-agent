import { describe, expect, it } from "vitest";
import { buildVerificationLine, resolveHermesFinalText } from "@/lib/olivia/conversation/response";
import type { OliviaToolResult } from "@/lib/olivia/v2/types";

// 코드 요청서(2026-09-18) 작업 B — Hermes 원문 뒤에 붙는 "무엇이 저장/변경됐는지" 한 줄.
describe("buildVerificationLine — Hermes 원문 뒤에 붙는 검증 한 줄", () => {
  it("성공 + resourceId가 있는 도구 호출을 식별자 수준으로 요약한다", () => {
    const line = buildVerificationLine([
      { success: true, resourceType: "quote", resourceId: "8e541040-161d-4b4f-bbe8-b6812b4a7c40" },
    ]);
    expect(line).toBe("✓ 견적서 저장됨(8e541040)");
  });

  it("changedEntityId가 있으면 resourceId보다 우선한다", () => {
    const line = buildVerificationLine([
      { success: true, resourceType: "contract", resourceId: "resource-id-aaa", changedEntityId: "changed-id-bbb" },
    ]);
    expect(line).toBe("✓ 계약서 저장됨(changed-)");
  });

  it("여러 도구 호출은 쉼표로 이어붙이고 중복은 제거한다", () => {
    const line = buildVerificationLine([
      { success: true, resourceType: "quote", resourceId: "quote-aaaaaaaa" },
      { success: true, resourceType: "memo", resourceId: "memo-bbbbbbbb" },
      { success: true, resourceType: "quote", resourceId: "quote-aaaaaaaa" },
    ]);
    expect(line).toBe("✓ 견적서 저장됨(quote-aa), 메모 저장됨(memo-bbb)");
  });

  it("실패한 호출은 무시한다", () => {
    const line = buildVerificationLine([
      { success: false, resourceType: "quote", resourceId: "quote-aaaaaaaa" },
    ]);
    expect(line).toBeNull();
  });

  it("식별자가 없는 성공 호출은 무시한다(예: 순수 UI 액션만 낸 도구)", () => {
    const line = buildVerificationLine([{ success: true, resourceType: "quote" }]);
    expect(line).toBeNull();
  });

  it("빈 배열이면 null", () => {
    expect(buildVerificationLine([])).toBeNull();
  });

  it("모르는 resourceType은 '항목'으로 표시한다", () => {
    const line = buildVerificationLine([{ success: true, resourceType: "unknown_type", resourceId: "id-12345678" }]);
    expect(line).toBe("✓ 항목 저장됨(id-12345)");
  });
});

// 코드 요청서(2026-09-18) 작업 B 수용 기준 — app/api/olivia/v2/stream/route.ts의 useHermes
// 블록이 그대로 쓰는 우선순위 판단(pending action > 검증 실패 템플릿 > 원문+검증 한 줄 > 원문).
describe("resolveHermesFinalText — 헤르메스 최종 텍스트 우선순위(작업 B)", () => {
  const successResult = (overrides: Partial<OliviaToolResult> = {}): OliviaToolResult => ({
    tool: "create_quote", success: true, data: { summary: "견적서를 만들었어요.", totalAmount: 500000 }, ...overrides,
  });
  const failedResult: OliviaToolResult = { tool: "create_quote", success: false, error: "저장 공간이 부족합니다." };

  it("읽기전용 도구만 실행됐으면(nonReadOnlyEntries 비어있음) 원문 그대로 쓴다", () => {
    const result = resolveHermesFinalText({
      nonReadOnlyEntries: [],
      verificationCalls: [],
      hermesRawText: "네, 이번 주 일정은 3건이에요.",
    });
    expect(result).toEqual({ text: "네, 이번 주 일정은 3건이에요.", source: "hermes_raw" });
  });

  it("[수용기준] 쓰기 도구가 성공하면 헤르메스 원문이 그대로 보이고 그 아래 검증 한 줄이 붙는다", () => {
    const result = resolveHermesFinalText({
      nonReadOnlyEntries: [{ result: successResult() }],
      verificationCalls: [{ success: true, resourceType: "quote", resourceId: "8e541040-161d-4b4f-bbe8-b6812b4a7c40" }],
      hermesRawText: "네, 요청하신 대로 견적서를 만들어 드렸어요!",
    });
    expect(result).toEqual({
      text: "네, 요청하신 대로 견적서를 만들어 드렸어요!\n\n✓ 견적서 저장됨(8e541040)",
      source: "hermes_raw_with_verification",
    });
  });

  it("[수용기준] 도구가 실패하면 기존과 동일하게 실패 안내로 완전히 교체된다", () => {
    const result = resolveHermesFinalText({
      nonReadOnlyEntries: [{ result: failedResult }],
      verificationCalls: [{ success: false, resourceType: "quote", resourceId: "quote-1" }],
      hermesRawText: "네, 견적서를 저장했어요!", // Hermes가 낙관적으로 잘못 말한 상황
    });
    expect(result.source).toBe("verified_template_failure");
    expect(result.text).not.toContain("저장했어요"); // 헤르메스의 잘못된 낙관적 원문이 그대로 나가면 안 된다
    expect(result.text).toContain("저장 공간이 부족합니다");
  });

  it("실패했는데 템플릿을 못 만들면(summary/totalAmount 없음) 원문으로 안전하게 폴백한다", () => {
    const result = resolveHermesFinalText({
      nonReadOnlyEntries: [{ result: { tool: "x", success: false } }],
      verificationCalls: [{ success: false }],
      hermesRawText: "요청을 처리하지 못했어요.",
    });
    expect(result).toEqual({ text: "요청을 처리하지 못했어요.", source: "hermes_raw" });
  });

  it("검증 한 줄을 못 만들면(식별자 없음) 원문만 그대로 쓴다", () => {
    const result = resolveHermesFinalText({
      nonReadOnlyEntries: [{ result: successResult() }],
      verificationCalls: [{ success: true, resourceType: "quote" }], // resourceId 없음
      hermesRawText: "네, 처리했어요.",
    });
    expect(result).toEqual({ text: "네, 처리했어요.", source: "hermes_raw" });
  });

  it("pending action이 있으면 다른 무엇보다 우선한다", () => {
    const result = resolveHermesFinalText({
      pendingActionPrompt: "선금 50%로 진행할까요?",
      nonReadOnlyEntries: [{ result: successResult() }],
      verificationCalls: [{ success: true, resourceType: "quote", resourceId: "quote-1" }],
      hermesRawText: "네, 처리했어요.",
    });
    expect(result).toEqual({ text: "선금 50%로 진행할까요?", source: "pending_action" });
  });

  it("일부 성공+일부 실패가 섞이면 실패로 취급한다(둘 다 있으면 안전 쪽)", () => {
    const result = resolveHermesFinalText({
      nonReadOnlyEntries: [{ result: successResult() }, { result: failedResult }],
      verificationCalls: [
        { success: true, resourceType: "quote", resourceId: "quote-1" },
        { success: false, resourceType: "memo", resourceId: "memo-1" },
      ],
      hermesRawText: "네, 처리했어요.",
    });
    expect(result.source).toBe("verified_template_failure");
  });
});
