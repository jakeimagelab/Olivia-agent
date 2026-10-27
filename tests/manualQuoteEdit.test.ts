import { describe, expect, it } from "vitest";
import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";
import { pricingStateAfterManualCustomItemEdit } from "@/lib/quote/manualQuoteEdit";

describe("pricingStateAfterManualCustomItemEdit", () => {
  it("사용자 항목 금액을 직접 수정하면 총액 고정과 항목 금액 숨김을 해제한다", () => {
    expect(pricingStateAfterManualCustomItemEdit({
      fixedTotal: 3_700_000,
      itemPricesHidden: true,
    }, "amount")).toEqual({
      fixedTotal: null,
      itemPricesHidden: false,
    });
  });

  it("사용자 항목 이름이나 설명 수정은 기존 가격 설정을 유지한다", () => {
    const current = { fixedTotal: 3_700_000, itemPricesHidden: true };

    expect(pricingStateAfterManualCustomItemEdit(current, "name")).toBe(current);
    expect(pricingStateAfterManualCustomItemEdit(current, "detail")).toBe(current);
  });

  it("고정 총액 견적에 새 금액을 입력하면 실제 합계에 반영된다", () => {
    const pricing = pricingStateAfterManualCustomItemEdit({
      fixedTotal: 3_700_000,
      itemPricesHidden: true,
    }, "amount");
    const totals = computeQuoteTotals({
      packageTotal: 0,
      singleItemsTotal: 0,
      optionsTotal: 0,
      customItems: [
        { id: "original", name: "기존 촬영", detail: "", amount: 3_700_000 },
        { id: "added", name: "프로필 추가", detail: "", amount: 200_000 },
      ],
      discountRate: 0,
      extraDiscount: 0,
      fixedTotal: pricing.fixedTotal,
      taxMode: "separate",
    });

    expect(totals.supplyAmount).toBe(3_900_000);
    expect(totals.finalAmount).toBe(4_290_000);
    expect(totals.specialAdjustmentAmount).toBe(0);
  });
});
