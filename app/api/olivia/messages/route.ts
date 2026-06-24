import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/olivia/messages?limit=60&since=ISO&source=telegram
export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const limit  = Math.min(parseInt(searchParams.get("limit") || "60"), 200);
  const since  = searchParams.get("since");
  const source = searchParams.get("source");

  let q = db
    .from("olivia_chat_messages")
    .select("id, created_at, role, content, source")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since)  q = q.gt("created_at", since);
  if (source) q = q.eq("source", source);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, messages: (data ?? []).reverse() });
}

// POST /api/olivia/messages
// body: { messages: [{role, content, source?}] }  또는  { role, content, source? }
export async function POST(req: NextRequest) {
  const db   = getSupabaseAdmin();
  const body = await req.json();

  const items: any[] = body.messages ?? [{ role: body.role, content: body.content, source: body.source }];

  const rows = items
    .filter((m) => m?.role && m?.content)
    .map((m) => ({ role: m.role, content: m.content, source: m.source ?? "web" }));

  if (!rows.length) return NextResponse.json({ ok: true });

  const { error } = await db.from("olivia_chat_messages").insert(rows);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/olivia/messages  — 전체 삭제 (초기화)
export async function DELETE() {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("olivia_chat_messages")
    .delete()
    .not("id", "is", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
