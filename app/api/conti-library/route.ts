import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToDocument } from "@/lib/conti-library/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("conti_case_documents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, documents: (data ?? []).map(rowToDocument) });
}
