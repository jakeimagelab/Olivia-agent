import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("agent_tasks")
    .update({
      status: "completed",
      started_at: now,
      completed_at: now,
      output_data: { message: "1차 MVP에서는 실제 AI 생성 대신 실행 완료 상태로 기록합니다.", completedAt: now },
      updated_at: now,
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await db.from("agent_logs").insert({
    agent_task_id: params.id,
    workflow_run_id: data.workflow_run_id,
    log_type: "task_completed",
    message: `${data.title} 작업이 완료 처리되었습니다.`,
    output_summary: "MVP 실행 완료",
    success: true,
  });
  return NextResponse.json({ ok: true, task: data });
}
