import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 30, 1), 100);
  let query = getSupabaseAdmin().from("olivia_briefings").select("*").order("briefing_date", { ascending: false }).order("generated_at", { ascending: false }).limit(limit);
  if (params.get("type")) query = query.eq("briefing_type", params.get("type")!);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [], briefings: data ?? [] });
}
