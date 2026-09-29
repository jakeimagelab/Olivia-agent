import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";
import type { CustomItem } from "@/lib/quote/quoteFormTypes";

export type QuoteItem = {
  id?: string;
  name: string;
  detail?: string;
  unitPrice: number;
  qty: number;
  subtotal: number;
  note?: string;
};

export type QuoteItemMatch = { index: number; item: QuoteItem };

// deposit_rate=0(전액 잔금)은 정상 값이다 — `Number(quote.deposit_rate) || 50`처럼 coercion
// 뒤에 `||`/`??`를 걸면 Number(0)도 falsy라 0이 항상 50으로 되돌아간다(Olivia OS 채팅/견적서
// 수정 로직 개선 §4/§13 TEST 7). null/undefined인지 원본 값에서 먼저 판별한 뒤에만 기본값을 쓴다.
export function depositRateOf(quote: Record<string, unknown>): number {
  const raw = quote?.deposit_rate;
  if (raw === null || raw === undefined) return 50;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 50;
}

function normalized(value: unknown) {
  return String(value || "").toLowerCase().replace(/[\s/_-]+/g, "");
}

export function quoteItems(value: unknown): QuoteItem[] {
  return Array.isArray(value) ? value.map((item) => ({ ...(item as QuoteItem) })) : [];
}

export function resolveQuoteItem(value: unknown, selector?: string, selectedId?: string, position?: number): QuoteItemMatch[] {
  const items = quoteItems(value);
  if (selectedId) {
    const exact = items.flatMap((item, index) => item.id === selectedId ? [{ item, index }] : []);
    if (exact.length) return exact;
  }
  if (position !== undefined && items[position]) return [{ item: items[position], index: position }];
  const query = normalized(selector);
  if (!query) return [];
  const exact = items.flatMap((item, index) => {
    const id = normalized(item.id);
    const name = normalized(item.name);
    return id === query || name === query ? [{ item, index }] : [];
  });
  if (exact.length) return exact;
  return items.flatMap((item, index) => {
    const target = [item.id, item.name, item.detail, item.note].map(normalized).join(" ");
    return target.includes(query) || query.includes(normalized(item.name)) ? [{ item, index }] : [];
  });
}

export function updateQuoteItem(value: unknown, index: number, changes: Partial<Pick<QuoteItem, "unitPrice" | "qty" | "detail" | "note">>) {
  const items = quoteItems(value);
  if (!items[index]) throw new Error("견적 항목을 찾지 못했어요.");
  const before = { ...items[index] };
  const unitPrice = changes.unitPrice ?? (Number(before.unitPrice) || 0);
  const qty = changes.qty ?? (Number(before.qty) || 1);
  const after = { ...before, ...changes, unitPrice, qty, subtotal: unitPrice * qty };
  items[index] = after;
  return { items, before, after };
}

export function addQuoteItem(value: unknown, item: Omit<QuoteItem, "subtotal">) {
  const items = quoteItems(value);
  const created: QuoteItem = { ...item, qty: Math.max(1, item.qty), subtotal: item.unitPrice * Math.max(1, item.qty) };
  return { items: [...items, created], created };
}

export function removeQuoteItem(value: unknown, index: number) {
  const items = quoteItems(value);
  const [removed] = items.splice(index, 1);
  if (!removed) throw new Error("견적 항목을 찾지 못했어요.");
  return { items, removed };
}

export function recalculateQuote(items: QuoteItem[], quote: Record<string, unknown>, fallbackDiscountAmount = Number(quote.discount_amount) || 0) {
  // 수정 경로도 화면·문서와 동일한 계산기만 쓴다. VAT는 언제나 공급가의 10%를 별도 계산한다.
  const customItems: CustomItem[] = items.map((item, index) => ({
    id: item.id || `quote-item:${index}`,
    name: item.name,
    detail: item.detail || "",
    amount: Number(item.subtotal) || 0,
    // 명시 조정·절삭과 외주는 할인 대상이 아니다. 수정 화면도 원문 파서와 같은
    // computeQuoteTotals 규칙 하나로만 계산한다.
    discountable: !/할인\s*제외|외주|헤어\s*메이크업|메이크업|헤메|모델\s*섭외|모델료|섭외|특별조정|절삭/i.test(`${item.name} ${item.note || ""}`),
  }));
  const formState = quote.form_state && typeof quote.form_state === "object" && !Array.isArray(quote.form_state)
    ? quote.form_state as Record<string, unknown>
    : {};
  const discount = formState.discount && typeof formState.discount === "object" && !Array.isArray(formState.discount)
    ? formState.discount as Record<string, unknown>
    : null;
  const discountRate = discount?.type === "percent" ? Math.max(0, Number(discount.value) || 0) : 0;
  const extraDiscount = discount?.type === "amount"
    ? Math.max(0, Number(discount.value) || 0)
    : discountRate > 0 ? 0 : Math.max(0, fallbackDiscountAmount);
  const totals = computeQuoteTotals({
    packageTotal: 0,
    singleItemsTotal: 0,
    optionsTotal: 0,
    customItems,
    discountRate,
    extraDiscount,
    depositRate: depositRateOf(quote),
  });
  return {
    supplyAmount: totals.supplyAmount,
    vat: totals.vat,
    totalAmount: totals.finalAmount,
    discountAmount: totals.discountTotal,
    depositAmount: totals.depositAmount,
    balanceAmount: totals.balanceAmount,
  };
}
