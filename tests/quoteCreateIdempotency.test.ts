import { describe, expect, it } from "vitest";
import {
  buildQuoteCreateRequestKey,
  QUOTE_CREATE_REQUEST_KEY_FIELD,
  stampQuoteCreateRequestKey,
} from "@/lib/quote/quoteCreateIdempotency";

describe("quote create idempotency", () => {
  const quoteData = {
    hospitalName: "1989 청담스시",
    totalAmount: 1_566_500,
    formState: { pricingMode: "custom_total" },
  };

  it("같은 대화와 같은 요청은 공백 차이와 무관하게 같은 key를 만든다", () => {
    const first = buildQuoteCreateRequestKey({
      recentActions: [], revision: 0,
      currentConversationId: "conversation-1",
      currentRequestText: "1989 청담스시 견적서 만들어줘",
    }, quoteData);
    const retry = buildQuoteCreateRequestKey({
      recentActions: [], revision: 0,
      currentConversationId: "conversation-1",
      currentRequestText: "  1989  청담스시 견적서 만들어줘  ",
    }, quoteData);

    expect(first).toBe(retry);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("대화나 canonical 견적 데이터가 다르면 다른 key를 만든다", () => {
    const base = buildQuoteCreateRequestKey({
      recentActions: [], revision: 0,
      currentConversationId: "conversation-1",
      currentRequestText: "견적서 만들어줘",
    }, quoteData);
    const otherConversation = buildQuoteCreateRequestKey({
      recentActions: [], revision: 0,
      currentConversationId: "conversation-2",
      currentRequestText: "견적서 만들어줘",
    }, quoteData);
    const otherAmount = buildQuoteCreateRequestKey({
      recentActions: [], revision: 0,
      currentConversationId: "conversation-1",
      currentRequestText: "견적서 만들어줘",
    }, { ...quoteData, totalAmount: 1_700_000 });

    expect(base).not.toBe(otherConversation);
    expect(base).not.toBe(otherAmount);
  });

  it("원문 대신 formState 내부에 hash만 저장한다", () => {
    const stamped = stampQuoteCreateRequestKey(quoteData, "request-key") as {
      formState: Record<string, unknown>;
    };
    expect(stamped.formState).toMatchObject({
      pricingMode: "custom_total",
      [QUOTE_CREATE_REQUEST_KEY_FIELD]: "request-key",
    });
    expect(JSON.stringify(stamped)).not.toContain("견적서 만들어줘");
  });
});
