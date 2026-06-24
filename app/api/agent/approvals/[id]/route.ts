import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("agent_approvals").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, approval: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getSupabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["status", "admin_memo", "preview_data"]) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.status === "approved") patch.approved_at = new Date().toISOString();
  if (body.status === "rejected") patch.rejected_at = new Date().toISOString();
  const { data, error } = await db.from("agent_approvals").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, approval: data });
}
