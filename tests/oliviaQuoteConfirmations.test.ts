import { describe, expect, it } from "vitest";
import { buildQuoteRoundConfirmation, buildQuoteToolConfirmation, isQuoteMutationTool } from "@/lib/olivia/output/quoteConfirmations";
import type { OliviaToolResult } from "@/lib/olivia/v2/types";

// app/api/olivia/v2/stream/route.ts는 견적 mutation tool 라운드의 최종 확인 문구를 모델의
// 자유 텍스트 대신 이 모듈이 만든 결정론적 문구로 교체한다(§29). 여기서는 그 라우팅 대상인
// 순수 함수 자체가 성공/실패/부분성공/스코프를 정확히 가려내는지 검증한다 — route.ts는
// OpenAI 스트리밍·Supabase·세션 인증을 전부 실제로 띄워야 해서 별도 통합 테스트가 없다(이
// 파일을 포함해 기존 테스트 스위트 어디에도 stream/route.ts 레벨 테스트가 없다).
describe("buildQuoteToolConfirmation", () => {
  it("견적 tool이 아니면 null을 반환한다(스코프 가드)", () => {
    const result: OliviaToolResult = { tool: "create_calendar_event", success: true, data: { summary: "일정을 만들었어요." } };
    expect(buildQuoteToolConfirmation("create_calendar_event", result)).toBeNull();
    expect(isQuoteMutationTool("create_calendar_event")).toBe(false);
  });

  it("성공 시 data.summary를 그대로 쓴다", () => {
    const result: OliviaToolResult = { tool: "apply_quote_discount", success: true, data: { summary: "10,000원 할인을 적용했어요." } };
    expect(buildQuoteToolConfirmation("apply_quote_discount", result)).toBe("10,000원 할인을 적용했어요.");
  });

  it("실패 시 result.error를 그대로 쓴다", () => {
    const result: OliviaToolResult = { tool: "update_quote_item", success: false, error: "견적 항목을 찾지 못했어요." };
    expect(buildQuoteToolConfirmation("update_quote_item", result)).toBe("견적 항목을 찾지 못했어요.");
  });

  it("실패인데 error가 비어있으면 일반 실패 문구로 대체한다", () => {
    const result: OliviaToolResult = { tool: "update_quote_item", success: false };
    expect(buildQuoteToolConfirmation("update_quote_item", result)).toBe("작업을 완료하지 못했어요. 다시 시도해주세요.");
  });
});

describe("buildQuoteRoundConfirmation", () => {
  it("이 라운드의 모든 호출이 견적 tool이면 성공 문구를 이어붙인다(멀티 액션)", () => {
    const text = buildQuoteRoundConfirmation([
      { toolName: "update_quote_item", result: { tool: "update_quote_item", success: true, data: { summary: "프로필촬영 항목을 수정했어요." } } },
      { toolName: "apply_quote_discount", result: { tool: "apply_quote_discount", success: true, data: { summary: "10% 할인을 적용했어요." } } },
    ]);
    expect(text).toBe("프로필촬영 항목을 수정했어요.\n10% 할인을 적용했어요.");
  });

  it("부분 성공/실패를 정직하게 함께 보고한다 — 전부 성공했다고 말하지 않는다", () => {
    const text = buildQuoteRoundConfirmation([
      { toolName: "update_quote_item", result: { tool: "update_quote_item", success: true, data: { summary: "제목을 변경했어요." } } },
      { toolName: "download_quote_pdf", result: { tool: "download_quote_pdf", success: false, error: "PDF 생성 중 문제가 있었어요." } },
    ]);
    expect(text).toBe("제목을 변경했어요.\nPDF 생성 중 문제가 있었어요.");
  });

  it("견적 tool과 다른 도메인 tool이 섞인 라운드는 null(기존 모델 텍스트 사용)", () => {
    const text = buildQuoteRoundConfirmation([
      { toolName: "update_quote_item", result: { tool: "update_quote_item", success: true, data: { summary: "제목을 변경했어요." } } },
      { toolName: "create_calendar_event", result: { tool: "create_calendar_event", success: true, data: {} } },
    ]);
    expect(text).toBeNull();
  });

  it("빈 배열은 null", () => {
    expect(buildQuoteRoundConfirmation([])).toBeNull();
  });
});
