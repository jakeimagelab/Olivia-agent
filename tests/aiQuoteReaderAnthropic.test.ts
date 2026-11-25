import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const anthropic = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    messages = { create: anthropic.create };
  },
}));

import { quoteReaderFailureDetails, readQuoteRequestWithAI } from "@/lib/quote/aiQuoteReader";
import { prepareQuoteCreateApproval } from "@/lib/olivia/v2/toolExecutors/quote";

const originalKey = process.env.ANTHROPIC_API_KEY;

describe("AI quote reader Anthropic call", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    anthropic.create.mockReset();
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("고정 save_quote_reading 도구 결과만 받아 구조화한다", async () => {
    anthropic.create.mockResolvedValue({
      content: [{
        type: "tool_use", name: "save_quote_reading", id: "tool-1", input: {
          clientName: "전주푸른안과", titleTopic: null, isEvent: false, contactName: "대표원장님",
          phone: null, email: null, blankContact: true, shootDate: "2026-10-26",
          items: [{ name: "의료진 프로필", details: [], amount: null, quantity: 1, free: false }],
          fixedTotal: 3_700_000, itemPricesHidden: true, vatIncluded: false, depositRate: 50,
          discount: null, roundDownUnit: null, brandExplicit: null, unreadLines: [], uncertain: [],
        },
      }],
    });
    const result = await readQuoteRequestWithAI({ text: "전주푸른안과 견적서\n의료진 프로필\n전체 금액 370만원", today: "2026-10-18" });
    expect(result).toMatchObject({ clientName: "전주푸른안과", fixedTotal: 3_700_000 });
    expect(anthropic.create).toHaveBeenCalledWith(expect.objectContaining({
      max_tokens: 4000, thinking: { type: "disabled" }, tool_choice: { type: "tool", name: "save_quote_reading" },
    }));
    expect(anthropic.create.mock.calls[0]?.[0]).not.toHaveProperty("temperature");
  });

  it("AI 호출 실패 시 기존 파서로 읽고 카드에 안내한다", async () => {
    anthropic.create.mockRejectedValue(new Error("timeout"));
    const prepared = await prepareQuoteCreateApproval({
      requestText: "전주푸른안과 견적서 만들어.\n의료진 프로필\n전체 금액 370만원",
      db: {} as never,
    });
    expect(prepared.fallbackNotice).toBe("AI 읽기에 실패해 기본 규칙으로 읽었어요 (사유: 시간 초과)");
    expect(prepared.preview).toContain("AI 읽기에 실패해 기본 규칙으로 읽었어요");
  });

  it("AI 요청이 400으로 실패해도 총액과 부가세 및 지급 조건을 견적에 반영한다", async () => {
    anthropic.create.mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));
    const prepared = await prepareQuoteCreateApproval({
      requestText: "테스트안과 브랜드 촬영 견적서\n의료진프로필\n연출(진료/수술)\n인테리어사진(3월 이후 촬영)\n서비스항목\n15초 영상(인테리어, 단체연출)\n총 금액 300만원, 부가세 별도\n선금/잔금 50/50",
      db: {} as never,
    });
    expect(prepared.parsed).toMatchObject({ clientName: "테스트안과", fixedTotal: 3_000_000, taxMode: "separate", depositRate: 50, itemPricesHidden: true });
    expect(prepared.parsed.items).toHaveLength(4);
    expect(prepared.parsed.items[3]).toMatchObject({ name: "15초 영상(인테리어, 단체연출)", free: true, amount: 0 });
    expect(prepared.preview).toContain("테스트안과 브랜드촬영 견적서");
    expect(prepared.preview).toContain("공급가 3,000,000원 + 부가세 300,000원 = 합계 3,300,000원");
  });

  it("도구 미호출과 API 상태를 진단 코드로 보존한다", async () => {
    anthropic.create.mockResolvedValueOnce({ content: [{ type: "text", text: "no tool" }] });
    await expect(readQuoteRequestWithAI({ text: "테스트의원\n프로필촬영", today: "2026-10-18" }))
      .rejects.toMatchObject({ code: "TOOL_NOT_CALLED" });
    const apiError = Object.assign(new Error("bad request"), { status: 429 });
    expect(quoteReaderFailureDetails(apiError)).toMatchObject({ code: "API_ERROR(429)", status: 429 });
    const creditError = Object.assign(new Error("Your credit balance is too low to access the Anthropic API."), { status: 400 });
    expect(quoteReaderFailureDetails(creditError)).toMatchObject({ code: "INSUFFICIENT_CREDITS", status: 400 });
  });

  it("필수 칸이 빠진 도구 응답을 SCHEMA_ERROR로 거절한다", async () => {
    anthropic.create.mockResolvedValueOnce({
      content: [{ type: "tool_use", name: "save_quote_reading", id: "tool-bad", input: { items: [], unreadLines: [], uncertain: [] } }],
    });
    await expect(readQuoteRequestWithAI({ text: "테스트의원\n프로필촬영", today: "2026-10-18" }))
      .rejects.toMatchObject({ code: "SCHEMA_ERROR" });
  });
});
