import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  let query = getSupabaseAdmin().from("library_items").select("*").order("created_at", { ascending: false }).limit(200);
  if (category) query = query.eq("category", category);
  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.category || !body?.title) {
    return NextResponse.json({ ok: false, error: "category, title은 필수입니다." }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin().from("library_items").insert({
    category: body.category,
    title: body.title,
    content: body.content ?? {},
    tags: body.tags ?? [],
    source: body.source ?? null,
  }).select().single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
