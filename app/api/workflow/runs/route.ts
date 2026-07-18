import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_WORKFLOW_RUNS } from "@/lib/workflow";
import { buildNextAction, createStepTasks, ensureStepRun } from "@/lib/workflowAutomation";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("workflow_runs").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, runs: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: true, mock: true, note: getErrorMessage(error), runs: MOCK_WORKFLOW_RUNS });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("workflow_runs")
    .insert({
      client_id: body.client_id ?? null,
      project_id: body.project_id ?? null,
      template_id: body.template_id ?? null,
      client_name: body.client_name ?? "",
      project_name: body.project_name ?? "",
      manager_name: body.manager_name ?? "",
      contact_name: body.contact_name ?? body.manager_name ?? "",
      contact_email: body.contact_email ?? body.email ?? "",
      shoot_date: body.shoot_date || null,
      current_step_key: body.current_step_key ?? "consult_meeting",
      next_action: body.next_action ?? buildNextAction(body.current_step_key ?? "consult_meeting"),
      status: body.status ?? "active",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await ensureStepRun(db, data.id, data.current_step_key, "in_progress");
  const taskResult = await createStepTasks(db, data.id, data.current_step_key);
  return NextResponse.json({ ok: true, run: data, tasks: taskResult.created });
}
