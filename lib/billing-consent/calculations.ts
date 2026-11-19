import type {
  BillingConsentItem,
  BillingConsentItemInput,
  BillingConsentTotals,
} from "./types";

const MAX_BILLING_AMOUNT = 9_000_000_000_000;

function asNonNegativeInteger(value: unknown, label: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_BILLING_AMOUNT) {
    throw new Error(`${label}은 0 이상의 원 단위 정수여야 합니다.`);
  }
  return number;
}

export function normalizeBillingConsentItems(input: unknown): BillingConsentItemInput[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("청구 항목을 한 개 이상 입력해 주세요.");
  }
  if (input.length > 100) throw new Error("청구 항목은 100개까지 입력할 수 있습니다.");

  return input.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`${index + 1}번째 청구 항목이 올바르지 않습니다.`);
    }
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) throw new Error(`${index + 1}번째 청구 항목 이름을 입력해 주세요.`);
    if (name.length > 120) throw new Error("청구 항목 이름은 120자까지 입력할 수 있습니다.");
    const quantity = asNonNegativeInteger(item.quantity, "수량");
    if (quantity < 1) throw new Error("수량은 1 이상이어야 합니다.");
    const unitPrice = asNonNegativeInteger(item.unitPrice, "단가");
    return { name, quantity, unitPrice };
  });
}

export function calculateBillingConsentTotals(input: BillingConsentItemInput[]): BillingConsentTotals {
  const items: BillingConsentItem[] = input.map((item) => {
    const quantity = asNonNegativeInteger(item.quantity, "수량");
    const unitPrice = asNonNegativeInteger(item.unitPrice, "단가");
    const amount = quantity * unitPrice;
    if (!Number.isSafeInteger(amount) || amount > MAX_BILLING_AMOUNT) {
      throw new Error("청구 금액이 허용 범위를 초과했습니다.");
    }
    return { name: item.name.trim(), quantity, unitPrice, amount };
  });
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > MAX_BILLING_AMOUNT) {
    throw new Error("공급가액이 허용 범위를 초과했습니다.");
  }
  const vat = Math.round(subtotal * 0.1);
  const total = subtotal + vat;
  return { items, subtotal, vat, total };
}
