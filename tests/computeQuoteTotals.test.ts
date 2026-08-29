import { describe, expect, it } from "vitest";
import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";

// components/quote/QuoteBuilder.tsx의 인라인 계산(698~716행)을 그대로 옮긴 순수 함수다 —
// PHASE 2에서 채팅 Quote Preview Card(components/olivia/QuotePreviewChatCard.tsx)도 이
// 함수를 재사용하므로, 여기서 QuoteBuilder.tsx가 원래 계산하던 것과 같은 결과가 나오는지
// 고정된 입력값으로 회귀 확인한다.
describe("computeQuoteTotals — QuoteBuilder.tsx 인라인 계산 이동 회귀 테스트", () => {
  it("할인 없이 패키지+단일항목+옵션+기타항목을 그대로 합산한다", () => {
    const totals = computeQuoteTotals({
      packageTotal: 1_350_000,
      singleItemsTotal: 350_000,
      optionsTotal: 250_000, // 프로필 인원 추가 1인
      customItems: [{ id: "c1", name: "출장비", detail: "", amount: 100_000 }],
      discountRate: 0,
      extraDiscount: 0,
    });
    expect(totals.discountableSubtotal).toBe(1_350_000 + 350_000 + 250_000 + 100_000);
    expect(totals.discountTotal).toBe(0);
    // 만원 단위 절사 확인: 2,050,000은 이미 만원 단위라 그대로.
    expect(totals.supplyAmount).toBe(2_050_000);
    expect(totals.vat).toBe(205_000);
    expect(totals.finalAmount).toBe(2_255_000);
  });

  it("정률 할인은 discountableSubtotal에만 적용되고 nonDiscountable 항목은 원가 그대로 청구된다", () => {
    const totals = computeQuoteTotals({
      packageTotal: 1_000_000,
      singleItemsTotal: 0,
      optionsTotal: 0,
      customItems: [{ id: "c1", name: "외주 모델료", detail: "", amount: 200_000, discountable: false }],
      discountRate: 10,
      extraDiscount: 0,
    });
    expect(totals.discountableSubtotal).toBe(1_000_000);
    expect(totals.rateDiscountAmount).toBe(100_000);
    expect(totals.nonDiscountableCustomTotal).toBe(200_000);
    expect(totals.contentSubtotal).toBe(1_000_000 + 200_000);
    // 공급가 = (1,000,000+200,000 - 100,000) → 1,100,000, 만원 단위 절사라 그대로.
    expect(totals.supplyAmount).toBe(1_100_000);
  });

  it("추가할인(extraDiscount)은 할인 대상 소계를 넘지 못하도록 clamp된다", () => {
    const totals = computeQuoteTotals({
      packageTotal: 100_000,
      singleItemsTotal: 0,
      optionsTotal: 0,
      customItems: [],
      discountRate: 0,
      extraDiscount: 999_999_999,
    });
    expect(totals.extraDiscountAmount).toBe(100_000);
    expect(totals.rawSupplyAmount).toBe(0);
    expect(totals.supplyAmount).toBe(0);
    expect(totals.vat).toBe(0);
    expect(totals.finalAmount).toBe(0);
  });

  it("공급가는 만원 단위로 내림, 부가세는 반올림한다", () => {
    const totals = computeQuoteTotals({
      packageTotal: 1_234_567,
      singleItemsTotal: 0,
      optionsTotal: 0,
      customItems: [],
      discountRate: 0,
      extraDiscount: 0,
    });
    // 1,234,567 → 만원 단위 절사 → 1,230,000
    expect(totals.supplyAmount).toBe(1_230_000);
    expect(totals.vat).toBe(123_000);
    expect(totals.finalAmount).toBe(1_353_000);
  });
});
