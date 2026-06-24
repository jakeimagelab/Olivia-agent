import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("agent_approvals")
    .update({ status: "approved", admin_memo: body.memo ?? "", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (data.agent_task_id) await db.from("agent_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", data.agent_task_id);
  await db.from("agent_logs").insert({
    workflow_run_id: data.workflow_run_id,
    agent_task_id: data.agent_task_id,
    log_type: "approval_approved",
    message: `${data.title} 항목이 승인되었습니다.`,
    success: true,
  });
  return NextResponse.json({ ok: true, approval: data });
}
