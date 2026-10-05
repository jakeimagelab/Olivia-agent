// Quote Builder 폼 상태 타입 — components/quote/QuoteBuilder.tsx(사람이 쓰는 폼)와
// lib/store/useQuoteStore.ts(Agent가 Action Registry를 통해 건드리는 공유 상태)가 같은
// shape을 봐야 해서 컴포넌트 밖으로 분리했다.
export type Brand = "photoclinic" | "jakeimage";

/**
 * separate: 공급가에 VAT를 더한다(기존 기본값).
 * excluded: VAT를 청구하지 않는다.
 * included: 항목 합계가 VAT 포함 최종 금액이며, 공급가/VAT를 역산한다.
 */
export type QuoteTaxMode = "separate" | "excluded" | "included";

export type CustomerInfo = {
  hospitalName: string;
  managerName: string;
  phone: string;
  email: string;
  quoteDate: string;
  validUntil: string;
  shootDate: string;
  quoteNumber: string;
};

export type CustomItem = {
  id: string;
  name: string;
  detail: string;
  amount: number;
  /** 수량이 있는 원문 항목의 표시용 단가/수량. 합계 계산은 amount(소계)만 쓴다. */
  unitPrice?: number;
  quantity?: number;
  discountable?: boolean;
  /** 원문에서 금액 항목 앞에 온 구분 머리글. 금액 항목 자체는 아니다. */
  groupLabel?: string | null;
};

export type BenefitItem = {
  id: string;
  name: string;
};
