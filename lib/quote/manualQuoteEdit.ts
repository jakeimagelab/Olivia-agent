import type { CustomItem } from "@/lib/quote/quoteFormTypes";

export type ManualQuotePricingState = {
  fixedTotal: number | null;
  itemPricesHidden: boolean;
};

/**
 * 채팅으로 만든 견적은 확정 총액과 항목 금액 숨김을 함께 가질 수 있다.
 * 사람이 사용자 항목의 금액을 직접 편집하면 그 입력이 새 계산 기준이므로
 * 기존 총액 고정과 금액 숨김을 해제한다. 이름·설명 편집은 계산을 바꾸지 않는다.
 */
export function pricingStateAfterManualCustomItemEdit(
  current: ManualQuotePricingState,
  key: keyof CustomItem,
): ManualQuotePricingState {
  if (key !== "amount") return current;
  if (current.fixedTotal === null && !current.itemPricesHidden) return current;
  return { fixedTotal: null, itemPricesHidden: false };
}
