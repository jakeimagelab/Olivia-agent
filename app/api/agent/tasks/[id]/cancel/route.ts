import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("agent_tasks")
    .update({ status: "canceled", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await db.from("agent_logs").insert({
    agent_task_id: params.id,
    workflow_run_id: data.workflow_run_id,
    log_type: "task_canceled",
    message: `${data.title} 작업이 취소되었습니다.`,
    success: true,
  });
  return NextResponse.json({ ok: true, task: data });
}
