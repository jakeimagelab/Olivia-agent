import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const clientId = req.nextUrl.searchParams.get("clientId");
  let query = db.from("client_revision_requests").select("*, clients(name)").order("created_at", { ascending: false }).limit(100);
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, revisions: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const { id, status, adminReply } = await req.json();
  if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });

  const db = getSupabaseAdmin();
  const update: any = {};
  if (status) update.status = status;
  if (adminReply !== undefined) update.admin_reply = adminReply;

  const { error } = await db.from("client_revision_requests").update(update).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
