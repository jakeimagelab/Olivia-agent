import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin().from("meeting_commitments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id).in("status", ["open", "overdue"]).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "완료할 수 없는 약속 상태입니다." }, { status: 409 });
  return NextResponse.json({ ok: true, data });
}
