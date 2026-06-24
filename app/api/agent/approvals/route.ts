import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_APPROVALS } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseAdmin();
    const status = new URL(req.url).searchParams.get("status");
    let query = db.from("agent_approvals").select("*").order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, approvals: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: true, mock: true, note: error instanceof Error ? error.message : String(error), approvals: MOCK_APPROVALS });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("agent_approvals")
    .insert({
      client_id: body.client_id ?? null,
      project_id: body.project_id ?? null,
      workflow_run_id: body.workflow_run_id ?? null,
      agent_task_id: body.agent_task_id ?? null,
      approval_type: body.approval_type ?? "other",
      title: body.title,
      description: body.description ?? "",
      preview_data: body.preview_data ?? {},
      related_type: body.related_type ?? "",
      related_id: body.related_id ?? "",
      status: "pending",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await db.from("agent_logs").insert({
    workflow_run_id: data.workflow_run_id,
    agent_task_id: data.agent_task_id,
    log_type: "approval_requested",
    message: `${data.title} 승인 요청이 생성되었습니다.`,
    success: true,
  });
  return NextResponse.json({ ok: true, approval: data });
}
