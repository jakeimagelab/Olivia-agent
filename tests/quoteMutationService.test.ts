import { describe, expect, it } from "vitest";
import { recalculateQuote, removeQuoteItem, resolveQuoteItem, updateQuoteItem } from "@/lib/quote/quoteMutationService";

const items = [
  { id: "director", name: "대표원장 프로필", unitPrice: 300_000, qty: 1, subtotal: 300_000 },
  { id: "staff", name: "의료진 프로필", unitPrice: 400_000, qty: 1, subtotal: 400_000 },
  { id: "video", name: "인터뷰 영상", unitPrice: 500_000, qty: 1, subtotal: 500_000 },
];

describe("quote mutation service", () => {
  it("prefers the explicitly selected item", () => {
    expect(resolveQuoteItem(items, "프로필", "staff")).toMatchObject([{ index: 1 }]);
  });

  it("returns every ambiguous semantic candidate instead of the first item", () => {
    expect(resolveQuoteItem(items, "프로필")).toHaveLength(2);
  });

  it("updates price and recalculates subtotal immutably", () => {
    const result = updateQuoteItem(items, 1, { unitPrice: 500_000, qty: 2 });
    expect(result.after.subtotal).toBe(1_000_000);
    expect(items[1].subtotal).toBe(400_000);
  });

  it("removes only the resolved line item", () => {
    const result = removeQuoteItem(items, 2);
    expect(result.removed.id).toBe("video");
    expect(result.items).toHaveLength(2);
  });

  it("uses QuoteBuilder's default supply plus VAT calculation", () => {
    const amounts = recalculateQuote([{ id: "x", name: "촬영", unitPrice: 500_000, qty: 1, subtotal: 500_000 }], { deposit_rate: 50 });
    expect(amounts).toMatchObject({ supplyAmount: 500_000, vat: 50_000, totalAmount: 550_000, depositAmount: 275_000 });
  });
});
