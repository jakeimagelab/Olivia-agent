import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const clientId = req.nextUrl.searchParams.get("clientId");
  let query = db.from("client_reviews").select("*, clients(name)").order("created_at", { ascending: false }).limit(100);
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reviews: data ?? [] });
}
