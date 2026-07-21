import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const db = getSupabaseAdmin();
  let query = db.from("prompter_scripts").select("id,title,subject,content,client_id,updated_at").order("updated_at", { ascending: false }).limit(50);
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, scripts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.content?.trim()) {
    return NextResponse.json({ ok: false, error: "대본 내용이 비어있습니다." }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const payload = {
    title: body.title?.trim() || "제목 없는 대본",
    content: body.content,
    client_id: body.clientId ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = body.id
    ? await db.from("prompter_scripts").update(payload).eq("id", body.id).select().single()
    : await db.from("prompter_scripts").insert(payload).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, script: data });
}
