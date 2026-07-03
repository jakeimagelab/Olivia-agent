import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get("prefix");
  const limit = Number(searchParams.get("limit") ?? "10");

  if (prefix) {
    const { data, error } = await supabase
      .from("quotes")
      .select("quote_number")
      .ilike("quote_number", `${prefix}%`);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, quoteNumbers: (data ?? []).map((row) => row.quote_number as string) });
  }

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, quotes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  if (!body.quoteNumber) {
    return NextResponse.json({ ok: false, error: "quoteNumber 필수" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      quote_number:    body.quoteNumber,
      title:           body.title ?? "",
      hospital_name:   body.hospitalName ?? "",
      contact_name:    body.contactName ?? "",
      phone:           body.phone ?? "",
      email:           body.email ?? "",
      quote_date:      body.quoteDate ?? "",
      shoot_date:      body.shootDate ?? null,
      valid_until:     body.validUntil ?? "",
      items:           body.items ?? [],
      supply_amount:   body.supplyAmount ?? 0,
      discount_amount: body.discountAmount ?? 0,
      vat:             body.vat ?? 0,
      total_amount:    body.totalAmount ?? 0,
      deposit_amount:  body.depositAmount ?? 0,
      balance_amount:  body.balanceAmount ?? 0,
      deposit_rate:    body.depositRate ?? 50,
      memos:           body.memos ?? null,
      form_state:      body.formState ?? null,
    })
    .select("id, created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at });
}
