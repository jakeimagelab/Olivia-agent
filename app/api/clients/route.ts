import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  let query = supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, clients: data });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { name, manager_name, phone, email, department, website_url,
          instagram_url, blog_url, naver_place_url, memo,
          subscription_status, workflow_status } = body;

  if (!name) return NextResponse.json({ ok: false, error: "병원명 필수" }, { status: 400 });

  const { data, error } = await supabase
    .from("clients")
    .insert({ name, manager_name, phone, email, department,
              website_url, instagram_url, blog_url, naver_place_url,
              memo, subscription_status: subscription_status || "none",
              workflow_status: workflow_status || "상담완료" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}
