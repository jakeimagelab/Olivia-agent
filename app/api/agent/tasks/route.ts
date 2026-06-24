import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_AGENT_TASKS } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    let query = db.from("agent_tasks").select("*").order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, tasks: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: true, mock: true, note: error instanceof Error ? error.message : String(error), tasks: MOCK_AGENT_TASKS });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("agent_tasks")
    .insert({
      client_id: body.client_id ?? null,
      project_id: body.project_id ?? null,
      workflow_run_id: body.workflow_run_id ?? null,
      workflow_step_run_id: body.workflow_step_run_id ?? null,
      task_type: body.task_type ?? "general",
      title: body.title,
      description: body.description ?? "",
      input_data: body.input_data ?? {},
      output_data: body.output_data ?? {},
      priority: body.priority ?? "normal",
      status: body.status ?? "pending",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await db.from("agent_logs").insert({
    agent_task_id: data.id,
    workflow_run_id: data.workflow_run_id,
    log_type: "task_created",
    message: `${data.title} 작업이 생성되었습니다.`,
    success: true,
  });
  return NextResponse.json({ ok: true, task: data });
}
