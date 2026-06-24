import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_TEMPLATE } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("workflow_templates")
      .select("*, steps:workflow_steps(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, templates: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: true, mock: true, note: error instanceof Error ? error.message : String(error), templates: [MOCK_TEMPLATE] });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("workflow_templates")
    .insert({
      name: body.name,
      description: body.description ?? "",
      type: body.type ?? "custom",
      is_active: body.is_active ?? true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}
