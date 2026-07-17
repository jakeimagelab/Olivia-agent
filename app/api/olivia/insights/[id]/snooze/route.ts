import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const hours = Math.min(Math.max(Number(body.hours) || 24, 1), 24 * 30);
  const snoozedUntil = body.until ? new Date(body.until).toISOString() : new Date(Date.now() + hours * 60 * 60 * 1_000).toISOString();
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("olivia_insights").update({ snoozed_until: snoozedUntil }).eq("id", id).in("status", ["open", "acknowledged", "action_created"]).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "스누즈할 수 없는 인사이트 상태입니다." }, { status: 409 });
  await db.from("olivia_feedback").insert({ insight_id: id, feedback_type: "snoozed", original_content: data, edited_content: { snoozedUntil } });
  return NextResponse.json({ ok: true, data });
}
