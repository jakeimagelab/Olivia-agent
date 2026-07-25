import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseAdmin();

  const [quotesRes, contractsRes] = await Promise.all([
    db.from("quotes").select("id, client_id, hospital_name, quote_number, total_amount, created_at"),
    db.from("contracts").select("quote_number, hospital_name, created_at, signature_data_url"),
  ]);
  if (quotesRes.error) return NextResponse.json({ ok: false, error: quotesRes.error.message }, { status: 500 });
  if (contractsRes.error) return NextResponse.json({ ok: false, error: contractsRes.error.message }, { status: 500 });

  const quotes = quotesRes.data ?? [];
  const contracts = contractsRes.data ?? [];
  const signedQuoteNumbers = new Set(
    contracts.filter((c) => !!c.signature_data_url).map((c) => c.quote_number)
  );
  const contractDateByQuoteNumber = new Map(
    contracts.filter((c) => !!c.signature_data_url).map((c) => [c.quote_number, c.created_at])
  );

  type HospitalAgg = {
    name: string;
    contractCount: number;
    contractAmount: number;
    quoteCount: number;
    pipelineAmount: number;
    lastContractAt: string | null;
  };
  const byHospital = new Map<string, HospitalAgg>();

  for (const quote of quotes) {
    const name = quote.hospital_name || "미지정";
    const agg = byHospital.get(name) ?? { name, contractCount: 0, contractAmount: 0, quoteCount: 0, pipelineAmount: 0, lastContractAt: null };
    agg.quoteCount += 1;
    const isSigned = quote.quote_number && signedQuoteNumbers.has(quote.quote_number);
    if (isSigned) {
      agg.contractCount += 1;
      agg.contractAmount += quote.total_amount ?? 0;
      const contractAt = contractDateByQuoteNumber.get(quote.quote_number) ?? null;
      if (contractAt && (!agg.lastContractAt || contractAt > agg.lastContractAt)) agg.lastContractAt = contractAt;
    } else {
      agg.pipelineAmount += quote.total_amount ?? 0;
    }
    byHospital.set(name, agg);
  }

  const hospitals = Array.from(byHospital.values()).sort((a, b) => b.contractAmount - a.contractAmount);

  const totalRevenue = hospitals.reduce((sum, h) => sum + h.contractAmount, 0);
  const pipelineAmount = hospitals.reduce((sum, h) => sum + h.pipelineAmount, 0);
  const contractedHospitals = hospitals.filter((h) => h.contractCount > 0);
  const avgContractAmount = contractedHospitals.length ? totalRevenue / contractedHospitals.length : 0;

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const revenueThisMonth = quotes
    .filter((q) => q.quote_number && signedQuoteNumbers.has(q.quote_number))
    .filter((q) => (contractDateByQuoteNumber.get(q.quote_number) ?? "") >= monthAgo)
    .reduce((sum, q) => sum + (q.total_amount ?? 0), 0);

  return NextResponse.json({
    ok: true,
    summary: {
      totalRevenue,
      pipelineAmount,
      avgContractAmount,
      contractedHospitalCount: contractedHospitals.length,
      revenueThisMonth,
    },
    hospitals,
  });
}
