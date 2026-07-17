import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const [insightRes, actionsRes, eventRes] = await Promise.all([
    db.from("olivia_insights").select("*").eq("id", id).maybeSingle(),
    db.from("olivia_actions").select("*").eq("insight_id", id).order("created_at"),
    db.from("olivia_feedback").select("*").eq("insight_id", id).order("created_at", { ascending: false }),
  ]);
  if (insightRes.error) return NextResponse.json({ ok: false, error: insightRes.error.message }, { status: 500 });
  if (!insightRes.data) return NextResponse.json({ ok: false, error: "인사이트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, data: { ...insightRes.data, actions: actionsRes.data ?? [], feedback: eventRes.data ?? [] } });
}
