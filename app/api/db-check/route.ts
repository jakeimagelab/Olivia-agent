import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const results: Record<string, boolean> = {};
  const errors: Record<string, string>  = {};

  const tables = ["mailing_queue", "clients", "consultation_memos"];

  try {
    const supabase = getSupabaseAdmin();
    for (const table of tables) {
      const { error } = await supabase.from(table).select("id").limit(1);
      if (error) {
        results[table] = false;
        errors[table]  = error.message;
      } else {
        results[table] = true;
      }
    }
    const allOk = Object.values(results).every(Boolean);
    return NextResponse.json({ ok: allOk, tables: results, errors });
  } catch (e: any) {
    return NextResponse.json({ ok: false, fatal: e.message, tables: results, errors }, { status: 500 });
  }
}
