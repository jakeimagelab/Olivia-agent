import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  let query = supabase
    .from("mailing_logs")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(200);

  const status = searchParams.get("status");
  const hosp   = searchParams.get("hospital_name");

  if (status) query = query.eq("status", status);
  if (hosp)   query = query.ilike("hospital_name", `%${hosp}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });

  return NextResponse.json({ ok: true, logs: data ?? [] });
}
