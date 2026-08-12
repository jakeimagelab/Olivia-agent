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
});
