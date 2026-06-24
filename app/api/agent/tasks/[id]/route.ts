import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("agent_tasks").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, task: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getSupabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["title", "description", "priority", "status", "input_data", "output_data", "error_message"]) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.status === "running") patch.started_at = new Date().toISOString();
  if (["completed", "failed", "canceled", "waiting_approval"].includes(body.status)) patch.completed_at = new Date().toISOString();
  const { data, error } = await db.from("agent_tasks").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await db.from("agent_logs").insert({
    agent_task_id: id,
    workflow_run_id: data.workflow_run_id,
    log_type: "task_status_changed",
    message: `${data.title} 작업 상태가 ${data.status}(으)로 변경되었습니다.`,
    success: true,
  });
  return NextResponse.json({ ok: true, task: data });
}
