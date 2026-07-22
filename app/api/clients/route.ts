import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildWorkflowNextAction } from "@/lib/workflowNextAction";
import { createClientWithWorkflow } from "@/lib/clients/createClientWithWorkflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ── 실제 DB 컬럼: hospital_name, contact_name, phone, email, specialty, memo ── */

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  let query = supabase
    .from("clients")
    .select("id, hospital_name, contact_name, phone, email, specialty, memo, created_at")
    .order("created_at", { ascending: false });

  if (q) query = query.ilike("hospital_name", `%${q}%`);

  const [clientsRes, runsRes, tasksRes, approvalsRes, mailingRes] = await Promise.all([
    query,
    supabase
      .from("workflow_runs")
      .select("id, client_id, client_name, project_name, current_step_key, status, started_at")
      .neq("status", "canceled")
      .order("started_at", { ascending: true }),
    supabase.from("agent_tasks").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("agent_approvals").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("mailing_queue").select("*").order("created_at", { ascending: false }).limit(300),
  ]);

  if (clientsRes.error)
    return NextResponse.json({ ok: false, error: clientsRes.error.message }, { status: 500 });

  const runMap = Object.fromEntries(
    (runsRes.data ?? []).map((r) => [r.client_id, r])
  );

  const clients = (clientsRes.data ?? []).map((c) => {
    const run = runMap[c.id] ?? null;
    const normalized = normalizeClient(c, run);
    const nextAction = run ? buildWorkflowNextAction({
      run,
      tasks: (tasksRes.data ?? []).filter((task) => task.workflow_run_id === run.id),
      approvals: (approvalsRes.data ?? []).filter((approval) => approval.workflow_run_id === run.id),
      mailing: (mailingRes.data ?? []).filter((mail) => mail.workflow_run_id === run.id || mail.hospital_name === c.hospital_name),
    }) : null;
    return { ...normalized, next_action: nextAction };
  });

  return NextResponse.json(
    { ok: true, clients },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const hospitalName = body.name || body.hospital_name;
  if (!hospitalName) return NextResponse.json({ ok: false, error: "병원명 필수" }, { status: 400 });

  try {
    const result = await createClientWithWorkflow(supabase, {
      hospitalName,
      contactName: body.director_name || body.contact_name || body.manager_name,
      phone: body.phone,
      email: body.email,
      specialty: body.department || body.specialty,
      memo: body.memo,
      startStepKey: body.startStepKey,
      eventSource: "clients_api",
    });
    return NextResponse.json({ ok: true, id: result.client.id, workflowRunId: result.run?.id ?? null, created: result.created });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "고객 등록 실패" }, { status: 500 });
  }
}

/* 프론트가 기대하는 필드명으로 정규화 */
function normalizeClient(c: Record<string, unknown>, activeRun: unknown) {
  return {
    ...c,
    name:         c.hospital_name ?? "",
    manager_name: c.contact_name  ?? "",
    department:   c.specialty     ?? "",
    active_run:   activeRun,
  };
}
