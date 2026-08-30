import { describe, expect, it } from "vitest";
import { buildAgentQuoteData, calculateQuoteAmounts, updateQuoteItemPrice } from "@/lib/quote/agentQuote";

describe("Olivia Agent quote domain", () => {
  it("builds a real premium quote payload with calculated totals", () => {
    const quote = buildAgentQuoteData({ hospitalName: "히어산부인과", packageId: "premium", profileCount: 2 });
    expect(quote.hospitalName).toBe("히어산부인과");
    expect(quote.items).toHaveLength(2);
    expect(quote.totalAmount).toBe(2_500_000);
    expect(quote.depositAmount + quote.balanceAmount).toBe(quote.totalAmount);
  });

  it("interprets 50 as 500,000 won and recalculates an exact profile item", () => {
    const source = [{ id: "profile_shoot", name: "프로필촬영", unitPrice: 350_000, qty: 1, subtotal: 350_000 }];
    const updated = updateQuoteItemPrice(source, "프로필", 50);
    expect(updated.amount).toBe(500_000);
    expect(updated.items[0].subtotal).toBe(500_000);
    expect(calculateQuoteAmounts(updated.items).totalAmount).toBe(500_000);
  });

  it("does not mutate when multiple profile candidates exist", () => {
    const source = [
      { id: "profile_a", name: "프로필촬영 A", unitPrice: 100_000, qty: 1, subtotal: 100_000 },
      { id: "profile_b", name: "프로필촬영 B", unitPrice: 200_000, qty: 1, subtotal: 200_000 },
    ];
    const updated = updateQuoteItemPrice(source, "프로필", 50);
    expect(updated.matches).toHaveLength(2);
    expect(updated.items.map((item) => item.subtotal)).toEqual([100_000, 200_000]);
  });

  // 견적서 UX 개편(2026-08-31) — 채팅 마법사가 브랜드를 넘기면 그 브랜드의 실제 기본 타이틀을
  // 쓰고, brand가 없으면(기존 호출부와의 하위호환) photoclinic 기본값으로 동작해야 한다.
  it("defaults to photoclinic title when brand is omitted", () => {
    const quote = buildAgentQuoteData({ hospitalName: "히어산부인과", packageId: "standard" });
    expect(quote.title).toBe("포토클리닉 브랜드사진 견적서");
    expect(quote.formState.brand).toBe("photoclinic");
  });

  it("uses the jakeimage default title and threads brand into formState when brand=jakeimage", () => {
    const quote = buildAgentQuoteData({ hospitalName: "제이크컴퍼니", packageId: "standard", brand: "jakeimage" });
    expect(quote.title).toBe("제이크이미지연구소 브랜드사진 견적서");
    expect(quote.formState.brand).toBe("jakeimage");
  });

  it("falls back to photoclinic for an unrecognized brand value", () => {
    const quote = buildAgentQuoteData({ hospitalName: "히어산부인과", packageId: "standard", brand: "not-a-brand" });
    expect(quote.title).toBe("포토클리닉 브랜드사진 견적서");
    expect(quote.formState.brand).toBe("photoclinic");
  });
});
