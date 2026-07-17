import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin().from("olivia_actions").update({ status: "prepared" }).eq("id", id).eq("status", "suggested").select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "준비할 수 없는 행동 상태입니다." }, { status: 409 });
  return NextResponse.json({ ok: true, data });
}
