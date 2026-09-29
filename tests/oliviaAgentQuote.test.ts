import { describe, expect, it } from "vitest";
import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";
import { parseQuoteRequest } from "@/lib/quote/quoteRequestParser";
import { buildQuoteDataFromParsedRequest } from "@/lib/quote/quoteRequestData";

describe("Olivia Agent quote domain", () => {
  it("모델이 전달한 가격이 아니라 원문 가격으로 견적 payload를 만든다", () => {
    const request = parseQuoteRequest("히어산부인과 견적서\n프로필촬영 35만원\n연출 촬영 120만원");
    const quote = buildQuoteDataFromParsedRequest({ request, brand: "photoclinic" });
    expect(quote.hospitalName).toBe("히어산부인과");
    expect(quote.items.map((item) => item.subtotal)).toEqual([350_000, 1_200_000]);
    expect(quote.totalAmount).toBe(1_705_000);
    expect(quote.depositAmount + quote.balanceAmount).toBe(quote.totalAmount);
  });

  it("만원 미만을 자동 절삭하지 않고 VAT를 항상 별도로 계산한다", () => {
    const totals = computeQuoteTotals({
      packageTotal: 0, singleItemsTotal: 28_750, optionsTotal: 0, customItems: [], discountRate: 0, extraDiscount: 0,
    });
    expect(totals).toMatchObject({ supplyAmount: 28_750, vat: 2_875, finalAmount: 31_625 });
  });

  it("사용자가 지정한 절삭만 공급가 조정 행으로 적용한다", () => {
    const totals = computeQuoteTotals({
      packageTotal: 0, singleItemsTotal: 28_750, optionsTotal: 0, customItems: [], discountRate: 0, extraDiscount: 0, roundDownUnit: 1_000,
    });
    expect(totals).toMatchObject({ roundDownAmount: 750, supplyAmount: 28_000, vat: 2_800, finalAmount: 30_800 });
  });
});
