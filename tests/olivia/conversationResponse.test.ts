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
