import type { CustomItem, QuoteTaxMode } from "@/lib/quote/quoteFormTypes";

export type QuoteTotalsInput = {
  packageTotal: number;
  singleItemsTotal: number;
  optionsTotal: number;
  customItems: CustomItem[];
  discountRate: number;
  extraDiscount: number;
  /** 대표가 총액/절삭을 지시했을 때만 넣는 공급가 기준 조정값. */
  fixedTotal?: number | null;
  roundDownUnit?: number | null;
  depositRate?: number;
  taxMode?: QuoteTaxMode;
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
  specialAdjustmentAmount: number;
  roundDownAmount: number;
  depositAmount: number;
  balanceAmount: number;
  taxMode: QuoteTaxMode;
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
  // 총액 확정과 절삭은 항목 단가를 바꾸지 않는다. 계산 결과에만 명시적 조정으로 적용한다.
  const fixedTotal = input.fixedTotal == null ? NaN : Number(input.fixedTotal);
  const specialAdjustmentAmount = Number.isFinite(fixedTotal) && fixedTotal >= 0
    ? fixedTotal - rawSupplyAmount
    : 0;
  const beforeRoundDown = Math.max(rawSupplyAmount + specialAdjustmentAmount, 0);
  const roundDownUnit = Math.floor(Number(input.roundDownUnit) || 0);
  const roundDownAmount = roundDownUnit > 1 ? beforeRoundDown % roundDownUnit : 0;
  // 만원 미만 자동 절삭을 하지 않는다(2026-09-29). 절삭이 필요하면 추가할인으로
  // 직접 넣는다 — 시스템이 대표 대신 금액을 깎지 않는다.
  const amountAfterAdjustment = beforeRoundDown - roundDownAmount;
  const taxMode: QuoteTaxMode = input.taxMode === "excluded" || input.taxMode === "included"
    ? input.taxMode
    : "separate";
  // 포함세는 사용자가 넣은 항목/조정 후 금액 자체가 최종 합계다. 공급가와 VAT만 그
  // 합계에서 역산한다. 별도/제외 모드의 항목 금액 해석은 기존과 같다.
  const supplyAmount = taxMode === "included"
    ? Math.round(amountAfterAdjustment / 1.1)
    : amountAfterAdjustment;
  const vat = taxMode === "separate"
    ? Math.round(supplyAmount * 0.1)
    : taxMode === "included"
      ? amountAfterAdjustment - supplyAmount
      : 0;
  const finalAmount = taxMode === "separate" ? supplyAmount + vat : amountAfterAdjustment;
  // 0%도 정상 결제조건이다(잔금 100%). 값이 없을 때만 기본 50%를 쓴다.
  const requestedDepositRate = Number(input.depositRate);
  const depositRate = Number.isFinite(requestedDepositRate)
    ? Math.min(100, Math.max(0, requestedDepositRate))
    : 50;
  const depositAmount = Math.round(finalAmount * depositRate / 100);
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
    specialAdjustmentAmount,
    roundDownAmount,
    depositAmount,
    balanceAmount: finalAmount - depositAmount,
    taxMode,
  };
}
