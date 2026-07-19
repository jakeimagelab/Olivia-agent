import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const prefix = searchParams.get("prefix");
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "10") || 10));

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
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "견적 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    if (typeof body.quoteNumber !== "string" || !body.quoteNumber.trim()) {
      return NextResponse.json({ ok: false, error: "견적번호를 입력해주세요." }, { status: 400 });
    }

    const clientId = await resolveClientId(supabase, body.hospitalName);

    const payload = {
      quote_number:    body.quoteNumber,
      title:           body.title ?? "",
      hospital_name:   body.hospitalName ?? "",
      client_id:       clientId,
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
    };

    const { data: existing, error: findError } = await supabase
      .from("quotes")
      .select("id")
      .eq("quote_number", body.quoteNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw new Error(findError.message);

    const query = existing?.id
      ? supabase.from("quotes").update(payload).eq("id", existing.id)
      : supabase.from("quotes").insert(payload);
    const { data, error } = await query.select("id, created_at").single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at, updated: Boolean(existing?.id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "견적 저장 실패" }, { status: 500 });
  }
}
