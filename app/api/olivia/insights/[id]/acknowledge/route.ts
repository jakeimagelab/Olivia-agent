import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin().from("olivia_insights").update({ status: "acknowledged" }).eq("id", id).in("status", ["open", "action_created"]).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "확인할 수 없는 인사이트 상태입니다." }, { status: 409 });
  return NextResponse.json({ ok: true, data });
}
