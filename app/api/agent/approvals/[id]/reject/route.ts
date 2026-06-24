import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("agent_approvals")
    .update({ status: "rejected", admin_memo: body.memo ?? "", rejected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (data.agent_task_id) await db.from("agent_tasks").update({ status: "failed", error_message: body.memo ?? "승인 반려" }).eq("id", data.agent_task_id);
  await db.from("agent_logs").insert({
    workflow_run_id: data.workflow_run_id,
    agent_task_id: data.agent_task_id,
    log_type: "approval_rejected",
    message: `${data.title} 항목이 반려되었습니다.`,
    success: true,
  });
  return NextResponse.json({ ok: true, approval: data });
}
