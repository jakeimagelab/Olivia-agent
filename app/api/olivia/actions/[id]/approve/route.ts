import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { approveWorkflowItem } from "@/lib/workflowAutomation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data: action, error } = await db.from("olivia_actions").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  if (action.status !== "waiting_approval" || !action.approval_id) {
    return NextResponse.json({ ok: false, error: "승인 대기 중인 행동만 승인할 수 있습니다." }, { status: 409 });
  }
  try {
    await approveWorkflowItem(db, action.approval_id, body.memo ?? "");
    const { data: updated } = await db.from("olivia_actions").select("*").eq("id", id).single();
    return NextResponse.json({ ok: true, data: updated });
  } catch (approveError) {
    return NextResponse.json({ ok: false, error: approveError instanceof Error ? approveError.message : String(approveError) }, { status: 500 });
  }
}
