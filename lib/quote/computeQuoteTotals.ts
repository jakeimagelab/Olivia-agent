import type { CustomItem } from "@/lib/quote/quoteFormTypes";

export type QuoteTotalsInput = {
  packageTotal: number;
  singleItemsTotal: number;
  optionsTotal: number;
  customItems: CustomItem[];
  discountRate: number;
  extraDiscount: number;
};

export type QuoteTotals = {
  customTotal: number;
  discountableCustomTotal: number;
  nonDiscountableCustomTotal: number;
  discountableSubtotal: number;
  contentSubtotal: number;
  rateDiscountAmount: number;
  extraDiscountAmount: number;
  discountTotal: number;
  rawSupplyAmount: number;
  supplyAmount: number;
  vat: number;
  finalAmount: number;
};

// components/quote/QuoteBuilder.tsx의 실시간 미리보기가 쓰던 계산을 그대로 옮긴 순수 함수다
// (로직 변경 없음 — 코드만 이동). 채팅 Quote Preview Card(components/olivia/QuotePreviewChatCard.tsx)도
// 이 함수를 그대로 써서 "LLM이 금액을 임의로 계산해서 말하지 않는다"는 원칙을 지킨다.
// QuoteBuilder.tsx도 이 함수 호출로 교체됐으므로 두 화면의 계산 결과가 구조적으로 어긋날 수 없다.
export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  const { packageTotal, singleItemsTotal, optionsTotal, discountRate, extraDiscount } = input;
  // 이 함수는 QuoteBuilder.tsx 외에 채팅 Preview Card처럼 폼 생명주기 밖에서도 호출될 수 있어
  // customItems가 아직 채워지기 전(undefined)에 불릴 가능성을 방어적으로 처리한다.
  const customItems = input.customItems ?? [];
  const customTotal = customItems.reduce((sum, item) => sum + item.amount, 0);
  // 외주 헤어메이크업·모델료처럼 할인이 적용되면 안 되는 기타 항목은 discountable=false로
  // 표시해 할인율/추가할인 계산 대상(discountableSubtotal)에서 제외하고 원가 그대로 청구한다.
  const discountableCustomTotal = customItems.filter((item) => item.discountable !== false).reduce((sum, item) => sum + item.amount, 0);
  const nonDiscountableCustomTotal = customTotal - discountableCustomTotal;
  const discountableSubtotal = packageTotal + singleItemsTotal + optionsTotal + discountableCustomTotal;
  const contentSubtotal = discountableSubtotal + nonDiscountableCustomTotal;
  const rateDiscountAmount = Math.round(discountableSubtotal * (discountRate / 100));
  const extraDiscountAmount = Math.min(Math.max(Number(extraDiscount) || 0, 0), Math.max(discountableSubtotal - rateDiscountAmount, 0));
  const discountTotal = rateDiscountAmount + extraDiscountAmount;
  const rawSupplyAmount = Math.max(contentSubtotal - discountTotal, 0);
  const supplyAmount = Math.floor(rawSupplyAmount / 10000) * 10000;
  const vat = Math.round(supplyAmount * 0.1);
  const finalAmount = supplyAmount + vat;
  return {
    customTotal,
    discountableCustomTotal,
    nonDiscountableCustomTotal,
    discountableSubtotal,
    contentSubtotal,
    rateDiscountAmount,
    extraDiscountAmount,
    discountTotal,
    rawSupplyAmount,
    supplyAmount,
    vat,
    finalAmount,
  };
}
