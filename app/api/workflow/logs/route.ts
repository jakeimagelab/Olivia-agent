import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_LOGS } from "@/lib/workflow";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("agent_logs").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return NextResponse.json({ ok: true, logs: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: true, mock: true, note: getErrorMessage(error), logs: MOCK_LOGS });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("agent_logs")
    .insert({
      client_id: body.client_id ?? null,
      project_id: body.project_id ?? null,
      workflow_run_id: body.workflow_run_id ?? null,
      agent_task_id: body.agent_task_id ?? null,
      log_type: body.log_type ?? "manual",
      message: body.message,
      input_summary: body.input_summary ?? "",
      output_summary: body.output_summary ?? "",
      success: body.success ?? true,
      error_message: body.error_message ?? "",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, log: data });
}
