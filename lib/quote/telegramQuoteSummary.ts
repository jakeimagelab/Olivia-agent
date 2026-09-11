import type { SupabaseClient } from "@supabase/supabase-js";

type QuoteSummaryItem = {
  name: string;
  detail: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  included: boolean;
};

export type TelegramQuoteSummary = {
  quoteId: string;
  quoteNumber: string;
  title: string;
  hospitalName: string;
  items: QuoteSummaryItem[];
  discountAmount: number;
  discountPercent?: number;
  totalAmount: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonNegativeNumber(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

/** Telegram 카드용 데이터도 다른 캐시나 모델 인자를 섞지 않고 최신 quotes row만 쓴다. */
export function buildTelegramQuoteSummary(quote: Record<string, unknown>): TelegramQuoteSummary {
  const formState = record(quote.form_state);
  const discount = record(formState.discount);
  const rawPercent = discount.type === "percent" ? Number(discount.value) : NaN;
  const discountPercent = Number.isFinite(rawPercent)
    ? Math.min(100, Math.max(0, rawPercent))
    : undefined;
  const items = Array.isArray(quote.items) ? quote.items : [];

  return {
    quoteId: String(quote.id || ""),
    quoteNumber: String(quote.quote_number || ""),
    title: String(quote.title || "견적서"),
    hospitalName: String(quote.hospital_name || ""),
    items: items.flatMap((value): QuoteSummaryItem[] => {
      const item = record(value);
      const name = String(item.name || "").trim();
      if (!name) return [];
      const subtotal = nonNegativeNumber(item.subtotal);
      return [{
        name,
        detail: String(item.detail || "").trim(),
        unitPrice: nonNegativeNumber(item.unitPrice ?? item.unit_price),
        quantity: Math.max(1, Number(item.qty ?? item.quantity) || 1),
        subtotal,
        included: subtotal === 0,
      }];
    }),
    discountAmount: nonNegativeNumber(quote.discount_amount),
    ...(discountPercent === undefined ? {} : { discountPercent }),
    totalAmount: nonNegativeNumber(quote.total_amount),
  };
}

export async function loadTelegramQuoteSummary(db: SupabaseClient, quoteId: string) {
  const { data, error } = await db
    .from("quotes")
    .select("id,quote_number,title,hospital_name,items,discount_amount,total_amount,form_state")
    .eq("id", quoteId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "견적서를 찾지 못했어요.");
  return buildTelegramQuoteSummary(data as Record<string, unknown>);
}

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatTelegramQuoteSummary(summary: TelegramQuoteSummary) {
  const header = [
    `📄 ${summary.title || "견적서"}`,
    [summary.hospitalName, summary.quoteNumber].filter(Boolean).join(" · "),
  ].filter(Boolean);
  const itemLines = summary.items.length
    ? summary.items.map((item) => {
        const detail = item.detail ? ` (${item.detail})` : "";
        if (item.included) return `• ${item.name}${detail} — 포함`;
        const price = item.quantity > 1 && item.unitPrice > 0
          ? `${won(item.unitPrice)} × ${item.quantity} = ${won(item.subtotal)}`
          : won(item.subtotal);
        return `• ${item.name}${detail} — ${price}`;
      })
    : ["• 견적 항목 없음"];
  const discountLabel = summary.discountAmount > 0
    ? `할인${summary.discountPercent === undefined ? "" : ` ${summary.discountPercent}%`}  -${won(summary.discountAmount)}`
    : null;

  return [
    ...header,
    "",
    ...itemLines,
    ...(discountLabel ? ["", discountLabel] : []),
    "",
    `최종 금액  ${won(summary.totalAmount)}`,
  ].join("\n");
}
