import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_AGENT_TASKS, MOCK_APPROVALS, MOCK_WORKFLOW_RUNS } from "@/lib/workflow";
import { buildNextAction, createStepTasks, ensureStepRun } from "@/lib/workflowAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getSupabaseAdmin();
    const { data: runs, error: runError } = await db
      .from("workflow_runs")
      .select("*")
      .eq("client_id", id)
      .order("updated_at", { ascending: false });
    if (runError) throw runError;

    const runIds = (runs ?? []).map((run) => run.id);
    const [tasksRes, approvalsRes, logsRes] = await Promise.all([
      runIds.length ? db.from("agent_tasks").select("*").in("workflow_run_id", runIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      runIds.length ? db.from("agent_approvals").select("*").in("workflow_run_id", runIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      runIds.length ? db.from("agent_logs").select("*").in("workflow_run_id", runIds).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
    ]);
    if (tasksRes.error) throw tasksRes.error;
    if (approvalsRes.error) throw approvalsRes.error;
    if (logsRes.error) throw logsRes.error;

    return NextResponse.json({ ok: true, runs: runs ?? [], tasks: tasksRes.data ?? [], approvals: approvalsRes.data ?? [], logs: logsRes.data ?? [] });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      mock: true,
      note: error instanceof Error ? error.message : String(error),
      runs: MOCK_WORKFLOW_RUNS.filter((run) => run.client_id === id || id),
      tasks: MOCK_AGENT_TASKS,
      approvals: MOCK_APPROVALS,
      logs: [],
    });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("workflow_runs")
    .insert({
      client_id: id,
      template_id: body.template_id ?? null,
      client_name: body.client_name ?? "",
      project_name: body.project_name ?? "포토클리닉 촬영 프로젝트",
      manager_name: body.manager_name ?? "",
      contact_name: body.contact_name ?? body.manager_name ?? "",
      contact_email: body.contact_email ?? body.email ?? "",
      shoot_date: body.shoot_date || null,
      current_step_key: body.current_step_key ?? "consult_meeting",
      next_action: body.next_action ?? buildNextAction(body.current_step_key ?? "consult_meeting"),
      status: "active",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await ensureStepRun(db, data.id, data.current_step_key, "in_progress");
  const taskResult = await createStepTasks(db, data.id, data.current_step_key);
  await db.from("agent_logs").insert({
    client_id: id,
    workflow_run_id: data.id,
    log_type: "workflow_started",
    message: `${data.client_name || "고객"} 워크플로우가 시작되었습니다.`,
    output_summary: `created_tasks: ${taskResult.created.length}`,
    success: true,
  });
  return NextResponse.json({ ok: true, run: data, tasks: taskResult.created });
}
