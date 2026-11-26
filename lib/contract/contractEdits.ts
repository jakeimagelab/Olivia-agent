import {
  CONTRACT_CLAUSE_TEXT_LIMIT,
  CONTRACT_EDITABLE_CLAUSES,
  CONTRACT_TERM_TEXT_LIMIT,
  type ContractQuoteData,
} from "@/lib/contract/contractDocument";

export function contractContentPayload(quote: ContractQuoteData) {
  const { depositRate, paymentTerms, deliveryTerms, specialTerms, ...quoteData } = quote;
  return {
    quoteData,
    depositRate: depositRate ?? null,
    paymentTerms: paymentTerms ?? null,
    deliveryTerms: deliveryTerms ?? null,
    specialTerms: specialTerms ?? null,
  };
}

function optionalText(value: unknown, limit: number, label: string) {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > limit) {
    throw new Error(`${label}은 ${limit}자 이내로 입력해 주세요.`);
  }
  return value.trim() ? value : null;
}

export function contractContentUpdate(body: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (body.depositRate !== undefined) {
    const rate = body.depositRate;
    if (rate !== null && (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100)) {
      throw new Error("선금 비율은 0%에서 100% 사이로 입력해 주세요.");
    }
    update.deposit_rate = rate;
  }
  if (body.paymentTerms !== undefined) update.payment_terms = optionalText(body.paymentTerms, CONTRACT_TERM_TEXT_LIMIT, "잔금 납부 시점");
  if (body.deliveryTerms !== undefined) update.delivery_terms = optionalText(body.deliveryTerms, CONTRACT_TERM_TEXT_LIMIT, "사진 납품 기한");
  if (body.specialTerms !== undefined) update.special_terms = optionalText(body.specialTerms, CONTRACT_CLAUSE_TEXT_LIMIT, "특약사항");

  if (body.quoteData !== undefined) {
    const data = body.quoteData;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("계약서 데이터 형식이 올바르지 않습니다.");
    const quoteData = data as Record<string, unknown>;
    if (quoteData.clauses == null) {
      update.quote_data = quoteData;
    } else {
      if (typeof quoteData.clauses !== "object" || Array.isArray(quoteData.clauses)) throw new Error("계약 조항 데이터 형식이 올바르지 않습니다.");
      const raw = quoteData.clauses as Record<string, unknown>;
      const clauses = Object.fromEntries(CONTRACT_EDITABLE_CLAUSES.flatMap(({ key, title }) => {
        const value = optionalText(raw[key], CONTRACT_CLAUSE_TEXT_LIMIT, title);
        return value === null ? [] : [[key, value]];
      }));
      update.quote_data = { ...quoteData, clauses };
    }
  }
  return update;
}
