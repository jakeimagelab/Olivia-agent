import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: task, error: fetchErr } = await db
    .from("agent_tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !task) {
    return NextResponse.json({ ok: false, error: fetchErr?.message ?? "task not found" }, { status: 404 });
  }

  if (task.task_type === "original_delivery" && task.workflow_run_id) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const advanceRes = await fetch(`${baseUrl}/api/workflow/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_run_id: task.workflow_run_id, to_step_key: "original_delivery" }),
    });
    const advanceData = await advanceRes.json();

    const { data, error } = await db
      .from("agent_tasks")
      .update({
        status:      "completed",
        started_at:  now,
        completed_at: now,
        output_data: { automated: true, nas_link: advanceData.nas_link, completedAt: now },
        updated_at:  now,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, task: data, automated: true });
  }

  // MVP: 다른 task_type은 완료 상태로만 기록 (추후 구현)
  const { data, error } = await db
    .from("agent_tasks")
    .update({
      status:       "completed",
      started_at:   now,
      completed_at: now,
      output_data:  { message: "MVP — 추후 구현 예정", completedAt: now },
      updated_at:   now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await db.from("agent_logs").insert({
    agent_task_id:   id,
    workflow_run_id: data.workflow_run_id,
    log_type:        "task_completed",
    message:         `${data.title} 작업이 완료 처리되었습니다.`,
    output_summary:  "MVP 실행 완료",
    success:         true,
  });

  return NextResponse.json({ ok: true, task: data });
}
