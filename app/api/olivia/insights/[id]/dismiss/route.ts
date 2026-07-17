import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("olivia_insights").update({ status: "dismissed", dismissed_reason: body.reason ?? "", resolved_at: new Date().toISOString() }).eq("id", id).not("status", "in", "(resolved,dismissed)").select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "무시할 수 없는 인사이트 상태입니다." }, { status: 409 });
  await Promise.all([
    db.from("olivia_actions").update({ status: "dismissed" }).eq("insight_id", id).in("status", ["suggested", "prepared"]),
    db.from("olivia_feedback").insert({ insight_id: id, feedback_type: "dismissed", original_content: data, reason: body.reason ?? "" }),
  ]);
  return NextResponse.json({ ok: true, data });
}
