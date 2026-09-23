import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QuoteDocument from "@/components/quote/QuoteDocument";
import { quoteDocumentDataFromRow } from "@/lib/quote/quoteDocumentData";
import { QUOTE_PRINT_AUTH_HEADER, verifyQuotePrintToken } from "@/lib/quote/quotePrintAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  if (!verifyQuotePrintToken(id, requestHeaders.get(QUOTE_PRINT_AUTH_HEADER))) notFound();

  const { data: quote, error } = await getSupabaseAdmin()
    .from("quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !quote) notFound();

  const data = quoteDocumentDataFromRow(quote as Record<string, unknown>);

  return (
    <main
      className={`${styles.printPage} quote-print-page quote-app${data.brand === "jakeimage" ? " quote-app--jakeimage" : ""}`}
      data-quote-print-ready="true"
    >
      <QuoteDocument data={data} />
    </main>
  );
}
