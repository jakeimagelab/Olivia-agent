import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "morning";
  const { data, error } = await getSupabaseAdmin().from("olivia_briefings").select("*").eq("briefing_type", type).order("briefing_date", { ascending: false }).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? null, briefing: data ?? null });
}
