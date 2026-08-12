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

function normalized(value: unknown) {
  return String(value || "").toLowerCase().replace(/[\s/_-]+/g, "");
}

export function quoteItems(value: unknown): QuoteItem[] {
  return Array.isArray(value) ? value.map((item) => ({ ...(item as QuoteItem) })) : [];
}

export function resolveQuoteItem(value: unknown, selector?: string, selectedId?: string): QuoteItemMatch[] {
  const items = quoteItems(value);
  if (selectedId) {
    const exact = items.flatMap((item, index) => item.id === selectedId ? [{ item, index }] : []);
    if (exact.length) return exact;
  }
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

export function recalculateQuote(items: QuoteItem[], quote: Record<string, unknown>, discountAmount = Number(quote.discount_amount) || 0) {
  const gross = items.reduce((sum, item) => sum + Math.max(0, Number(item.subtotal) || 0), 0);
  const raw = Math.max(0, gross - Math.max(0, discountAmount));
  const formState = quote.form_state && typeof quote.form_state === "object" ? quote.form_state as Record<string, unknown> : {};
  const mode = formState.vatMode === "included" || formState.vatMode === "excluded" ? formState.vatMode : "separate";
  const supplyAmount = mode === "included" ? Math.round(raw / 1.1) : Math.floor(raw / 10_000) * 10_000;
  const vat = mode === "excluded" ? 0 : mode === "included" ? raw - supplyAmount : Math.round(supplyAmount * .1);
  const totalAmount = supplyAmount + vat;
  const depositRate = Number(quote.deposit_rate) || 50;
  const depositAmount = Math.round(totalAmount * depositRate / 100);
  return { supplyAmount, vat, totalAmount, depositAmount, balanceAmount: totalAmount - depositAmount };
}
