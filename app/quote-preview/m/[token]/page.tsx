import { getSupabaseAdmin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import QuotePreviewMobile, { type PreviewQuote } from "@/components/quote-preview/QuotePreviewMobile";

export const dynamic = "force-dynamic";

function toPreviewQuote(quote: Record<string, unknown>): PreviewQuote {
  const formState = quote.form_state && typeof quote.form_state === "object" ? quote.form_state as Record<string, unknown> : {};
  return {
    quoteNumber: String(quote.quote_number || ""),
    title: String(quote.title || ""),
    hospitalName: String(quote.hospital_name || ""),
    quoteDate: (quote.quote_date as string) || "",
    shootDate: (quote.shoot_date as string) || "",
    validUntil: (quote.valid_until as string) || "",
    items: Array.isArray(quote.items) ? quote.items as PreviewQuote["items"] : [],
    supplyAmount: Number(quote.supply_amount) || 0,
    discountAmount: Number(quote.discount_amount) || 0,
    vat: Number(quote.vat) || 0,
    totalAmount: Number(quote.total_amount) || 0,
    depositAmount: Number(quote.deposit_amount) || 0,
    balanceAmount: Number(quote.balance_amount) || 0,
    depositRate: Number(quote.deposit_rate) || 50,
    memos: (quote.memos as string) || "",
    status: String(quote.status || "draft"),
    brand: formState.brand === "jakeimage" ? "jakeimage" : "photoclinic",
    updatedAt: String(quote.updated_at || ""),
  };
}

export default async function QuoteMobilePreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getSupabaseAdmin();

  const { data: share } = await db.from("quote_shares").select("quote_id, revoked_at").eq("token", token).maybeSingle();
  if (!share || share.revoked_at) notFound();

  const { data: quote } = await db.from("quotes").select("*").eq("id", share.quote_id).maybeSingle();
  if (!quote) notFound();

  return <QuotePreviewMobile token={token} initialQuote={toPreviewQuote(quote)} />;
}
