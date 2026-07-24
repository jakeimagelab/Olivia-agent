import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MOCK_AGENT_TASKS, MOCK_APPROVALS, MOCK_WORKFLOW_RUNS } from "@/lib/workflow";
import { buildNextAction, createStepTasks, ensureStepRun } from "@/lib/workflowAutomation";
import { getErrorMessage } from "@/lib/errors";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { isPcrmUuid, validatePcrmProjectInput } from "@/lib/pcrm/validation";

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
      note: getErrorMessage(error),
      runs: MOCK_WORKFLOW_RUNS.filter((run) => run.client_id === id || id),
      tasks: MOCK_AGENT_TASKS,
      approvals: MOCK_APPROVALS,
      logs: [],
    });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPcrmUuid(id)) return NextResponse.json({ ok: false, error: "고객 ID가 올바르지 않습니다." }, { status: 400 });
  const body = await req.json();
  const validation = validatePcrmProjectInput(body);
  if (!validation.ok) return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data: client } = await db.from("clients").select("id,hospital_name,contact_name,email").eq("id", id).maybeSingle();
  if (!client) return NextResponse.json({ ok: false, error: "고객을 찾을 수 없습니다." }, { status: 404 });
  const project = validation.value;
  const { data, error } = await db
    .from("workflow_runs")
    .insert({
      client_id: id,
      template_id: project.templateId,
      client_name: client.hospital_name ?? "",
      project_name: project.projectName,
      project_type: project.projectType,
      shooting_type: project.shootingType,
      manager_name: project.managerName || client.contact_name || "",
      owner_name: project.managerName || client.contact_name || "",
      contact_name: client.contact_name || "",
      contact_email: client.email || "",
      consultation_date: project.consultationDate,
      shoot_date: project.shootDate,
      start_date: project.startDate,
      expected_completion_date: project.expectedCompletionDate,
      expected_contract_amount: project.expectedContractAmount,
      project_memo: project.projectMemo,
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
  await recordPcrmActivitySafely(db, {
    clientId: id,
    workflowRunId: data.id,
    actorType: "admin",
    actorName: project.managerName,
    actionType: "project_created",
    title: `${project.projectName} 프로젝트 생성`,
    description: `${client.hospital_name} 고객의 PCRM 프로젝트가 생성되었습니다.`,
    relatedType: "workflow_run",
    relatedId: data.id,
  });
  return NextResponse.json({ ok: true, run: data, tasks: taskResult.created });
}
