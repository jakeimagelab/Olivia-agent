import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("per_settings").select("*").limit(1).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data });
}

export async function PATCH(req: NextRequest) {
  const db = getSupabaseAdmin();
  const body = await req.json();
  const allowed = ["reward_rate","point_value","point_expiration_months","allow_donation","allow_product_order","min_points_to_use","policy_note"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];

  const { data: existing } = await db.from("per_settings").select("id").limit(1).single();
  if (!existing) return NextResponse.json({ ok: false, error: "설정 레코드 없음" }, { status: 404 });

  const { error } = await db.from("per_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existing.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
