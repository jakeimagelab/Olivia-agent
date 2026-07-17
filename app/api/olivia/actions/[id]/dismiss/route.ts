import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("olivia_actions").update({ status: "dismissed", error_message: body.reason ?? "" }).eq("id", id).in("status", ["suggested", "prepared", "waiting_approval", "approved"]).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "무시할 수 없는 행동 상태입니다." }, { status: 409 });
  await db.from("olivia_feedback").insert({ action_id: id, insight_id: data.insight_id, feedback_type: "dismissed", original_content: data, reason: body.reason ?? "" });
  return NextResponse.json({ ok: true, data });
}
