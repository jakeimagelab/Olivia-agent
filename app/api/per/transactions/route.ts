import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const type     = searchParams.get("type");
  const limit    = parseInt(searchParams.get("limit") ?? "50");

  let query = db
    .from("reward_transactions")
    .select("*, clients(name:hospital_name, manager_name:contact_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (clientId) query = query.eq("client_id", clientId);
  if (type && type !== "전체") query = query.eq("type", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, transactions: data ?? [] });
}
