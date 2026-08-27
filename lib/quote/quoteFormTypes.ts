// Quote Builder 폼 상태 타입 — components/quote/QuoteBuilder.tsx(사람이 쓰는 폼)와
// lib/store/useQuoteStore.ts(Agent가 Action Registry를 통해 건드리는 공유 상태)가 같은
// shape을 봐야 해서 컴포넌트 밖으로 분리했다.
export type Brand = "photoclinic" | "jakeimage";

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
  discountable?: boolean;
};

export type BenefitItem = {
  id: string;
  name: string;
};
