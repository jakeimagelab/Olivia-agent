import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(_req: NextRequest, ctx: any) {
  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("contracts").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PATCH(req: NextRequest, ctx: any) {
  const { id } = await ctx.params;
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.quoteData !== undefined) update.quote_data = body.quoteData;
  if (body.signatureDataUrl !== undefined) update.signature_data_url = body.signatureDataUrl;
  if (body.hospitalName !== undefined) update.hospital_name = body.hospitalName;
  if (body.contactName !== undefined) update.contact_name = body.contactName;
  if (body.email !== undefined) update.email = body.email;

  const { error } = await supabase.from("contracts").update(update).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
