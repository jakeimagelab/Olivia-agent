import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const clientId = await resolveClientId(supabase, body.hospitalName);

  const { data, error } = await supabase
    .from("contracts")
    .insert({
      quote_number: body.quoteNumber ?? null,
      hospital_name: body.hospitalName ?? "",
      client_id: clientId,
      contact_name: body.contactName ?? "",
      email: body.email ?? "",
      quote_data: body.quoteData ?? {},
      signature_data_url: body.signatureDataUrl ?? null,
    })
    .select("id, created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at });
}
